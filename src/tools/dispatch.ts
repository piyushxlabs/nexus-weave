/**
 * 6-Step Deterministic Tool Dispatch Cycle for Nexus Weave.
 * AGENT_MASTER_PLAN.md Section 6, AGENT_LOGIC_SPEC.md Section 2, Section 9.
 */

import type {
  GraphAgentState,
  ProposedMutation,
  ToolInvocationRecord,
  ToolResult,
} from '../state/schema.js';
import {
  reduceErrorLogs,
  reduceInvocationLog,
  reducePendingProposal,
  reduceToolArtifacts,
} from '../state/reducers.js';
import { activityBus } from '../ui/activityBus.js';
import type { WebMCPExecutionContext, WebMCPToolResult } from '../webmcp/webmcp.js';
import { validateGetGraphTopologyArgs } from './schemas/getGraphTopology.schema.js';
import { validateDetectCyclesAndBottlenecksArgs } from './schemas/detectCyclesAndBottlenecks.schema.js';
import { validateComputeCriticalPathArgs } from './schemas/computeCriticalPath.schema.js';
import { validateMinimizeEdgeCrossingsArgs } from './schemas/minimizeEdgeCrossings.schema.js';
import { validatePinAndGroupRegionArgs } from './schemas/pinAndGroupRegion.schema.js';
import { handleGetGraphTopology } from './getGraphTopology.js';

// ============================================================================
// NexusWeave Error Hierarchy (AGENT_LOGIC_SPEC.md Section 9)
// ============================================================================

export class NexusWeaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NexusWeaveError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SchemaValidationError extends NexusWeaveError {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

export class UnknownNodeError extends NexusWeaveError {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownNodeError';
  }
}

export class PinnedConflictError extends NexusWeaveError {
  constructor(message: string) {
    super(message);
    this.name = 'PinnedConflictError';
  }
}

export class MissingDurationFieldError extends NexusWeaveError {
  constructor(message: string) {
    super(message);
    this.name = 'MissingDurationFieldError';
  }
}

export class ConcurrencyLockError extends NexusWeaveError {
  constructor(message: string = 'A mutating operation is already in flight. Concurrency limit is 1.') {
    super(message);
    this.name = 'ConcurrencyLockError';
  }
}

export class AbortError extends NexusWeaveError {
  constructor(message: string = 'Operation aborted by host context signal.') {
    super(message);
    this.name = 'AbortError';
  }
}

export class WebMCPSupportError extends NexusWeaveError {
  constructor(message: string = 'WebMCP is unsupported in this environment.') {
    super(message);
    this.name = 'WebMCPSupportError';
  }
}

// ============================================================================
// Concurrency Control
// ============================================================================

let isMutatingCallInFlight = false;

export function isMutatingLockActive(): boolean {
  return isMutatingCallInFlight;
}

export function resetConcurrencyLockForTesting(): void {
  isMutatingCallInFlight = false;
}

// ============================================================================
// Tool Handler Contract & Registry
// ============================================================================

export interface ToolHandlerContext {
  state: GraphAgentState;
  setState: (nextState: GraphAgentState) => void;
  signal?: AbortSignal;
  tool_call_id: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolHandlerContext
) => Promise<Record<string, unknown> | null>;

const toolHandlers: Map<string, ToolHandler> = new Map();

export function registerToolHandler(toolName: string, handler: ToolHandler): void {
  toolHandlers.set(toolName, handler);
}

export function initDefaultHandlers(): void {
  toolHandlers.set('get_graph_topology', handleGetGraphTopology as unknown as ToolHandler);
}

export function clearToolHandlersForTesting(): void {
  toolHandlers.clear();
}

initDefaultHandlers();

export const MUTATING_TOOL_NAMES = new Set([
  'minimize_edge_crossings',
  'pin_and_group_region',
]);

export interface DispatchStateAccessor {
  getState: () => GraphAgentState;
  setState: (nextState: GraphAgentState) => void;
}

// ============================================================================
// 6-Step Deterministic Dispatch Engine
// ============================================================================

let callIdCounter = 0;

export async function dispatchToolCall(
  toolName: string,
  args: Record<string, unknown>,
  stateAccessor: DispatchStateAccessor,
  context?: WebMCPExecutionContext
): Promise<WebMCPToolResult> {
  const toolCallId = `call_${Date.now()}_${++callIdCounter}`;
  const timestamp = Date.now();
  const isMutating = MUTATING_TOOL_NAMES.has(toolName);

  // Step 1: Inbound invocation received & start event emitted
  activityBus.emit('tool-invocation-start', {
    tool_call_id: toolCallId,
    tool_name: toolName,
    args,
    timestamp,
  });

  // Concurrency Lock Check for mutating calls
  if (isMutating) {
    if (isMutatingCallInFlight) {
      return handleFailure(
        new ConcurrencyLockError(),
        toolCallId,
        toolName,
        stateAccessor,
        timestamp
      );
    }
    isMutatingCallInFlight = true;
  }

  try {
    // Abort check
    if (context?.signal?.aborted) {
      throw new AbortError();
    }

    // Step 2: Schema Validation (ajv)
    validateToolArguments(toolName, args);

    const currentState = stateAccessor.getState();

    // Step 3: Trust & Scope Check
    const scopeCheck = evaluateTrustAndScope(toolName, args, currentState);

    // Step 4: Branching (Approval-Gate / Direct Execution)
    if (scopeCheck.branch === 'approval-gate') {
      return handleApprovalGate(
        toolCallId,
        toolName,
        args,
        scopeCheck.proposal!,
        stateAccessor,
        timestamp
      );
    }

    // Step 5: Direct Execution (compute-then-atomic-apply)
    activityBus.emit('tool-invocation-status', {
      tool_call_id: toolCallId,
      status: 'in_progress',
      timestamp: Date.now(),
    });

    const handler = toolHandlers.get(toolName);
    let result: Record<string, unknown> | null = null;

    if (handler) {
      result = await handler(args, {
        state: stateAccessor.getState(),
        setState: stateAccessor.setState,
        signal: context?.signal,
        tool_call_id: toolCallId,
      });
    }

    if (context?.signal?.aborted) {
      throw new AbortError();
    }

    // Record tool artifact and invocation in state
    const invocationRecord: ToolInvocationRecord = {
      tool_call_id: toolCallId,
      tool_name: toolName,
      args,
      timestamp,
    };
    const toolResultRecord: ToolResult = {
      tool_call_id: toolCallId,
      tool_name: toolName,
      success: true,
      status: isMutating ? 'applied' : undefined,
      result,
      error: null,
    };

    let updatedState = reduceInvocationLog(stateAccessor.getState(), invocationRecord);
    updatedState = reduceToolArtifacts(updatedState, {
      [toolCallId]: toolResultRecord,
    });

    // If confirm_pending was executed, clear the pending_proposal
    if (toolName === 'minimize_edge_crossings' && args.confirm_pending === true) {
      updatedState = reducePendingProposal(updatedState, null);
    }

    stateAccessor.setState(updatedState);

    // Emit result on activity bus
    activityBus.emit('tool-invocation-result', {
      tool_call_id: toolCallId,
      tool_name: toolName,
      success: true,
      status: isMutating ? 'applied' : undefined,
      result,
      timestamp: Date.now(),
    });

    return {
      success: true,
      status: isMutating ? 'applied' : undefined,
      result,
      error: null,
    };
  } catch (error: any) {
    // Step 6: Failure Path
    return handleFailure(error, toolCallId, toolName, stateAccessor, timestamp);
  } finally {
    if (isMutating) {
      isMutatingCallInFlight = false;
    }
  }
}

// ============================================================================
// Internal Validation & Routing Helpers
// ============================================================================

function validateToolArguments(toolName: string, args: unknown): void {
  let valResult;
  switch (toolName) {
    case 'get_graph_topology':
      valResult = validateGetGraphTopologyArgs(args);
      break;
    case 'detect_cycles_and_bottlenecks':
      valResult = validateDetectCyclesAndBottlenecksArgs(args);
      break;
    case 'compute_critical_path':
      valResult = validateComputeCriticalPathArgs(args);
      break;
    case 'minimize_edge_crossings':
      valResult = validateMinimizeEdgeCrossingsArgs(args);
      break;
    case 'pin_and_group_region':
      valResult = validatePinAndGroupRegionArgs(args);
      break;
    default:
      throw new SchemaValidationError(`Unrecognized tool name: '${toolName}'`);
  }

  if (!valResult.valid) {
    throw new SchemaValidationError(
      `Schema validation failed for '${toolName}': ${valResult.errors.join('; ')}`
    );
  }
}

interface TrustAndScopeEvaluation {
  branch: 'direct' | 'approval-gate';
  proposal?: ProposedMutation;
}

function evaluateTrustAndScope(
  toolName: string,
  args: Record<string, unknown>,
  state: GraphAgentState
): TrustAndScopeEvaluation {
  // Read-only tools always proceed directly
  if (!MUTATING_TOOL_NAMES.has(toolName)) {
    return { branch: 'direct' };
  }

  // 1. pin_and_group_region
  if (toolName === 'pin_and_group_region') {
    const nodeIds = args.node_ids as string[];
    // All-or-nothing check: all IDs must exist in graph_nodes
    for (const id of nodeIds) {
      if (!(id in state.graph_nodes)) {
        throw new UnknownNodeError(
          `Cannot pin/unpin unknown node '${id}'. All-or-nothing check failed.`
        );
      }
    }
    return { branch: 'direct' };
  }

  // 2. minimize_edge_crossings
  if (toolName === 'minimize_edge_crossings') {
    const regionNodeIds = args.region_node_ids as string[];
    const confirmPending = Boolean(args.confirm_pending);

    // Check unknown node IDs
    for (const id of regionNodeIds) {
      if (!(id in state.graph_nodes)) {
        throw new UnknownNodeError(
          `Target node '${id}' does not exist in graph_nodes.`
        );
      }
    }

    // Pinned check
    const pinnedTargetCount = regionNodeIds.filter((id) =>
      state.pinned_node_ids.has(id)
    ).length;

    if (pinnedTargetCount === regionNodeIds.length) {
      throw new PinnedConflictError(
        'No valid unpinned nodes in target region; all specified nodes are pinned.'
      );
    }

    const totalNodes = Object.keys(state.graph_nodes).length;
    const affectedShare = totalNodes > 0 ? regionNodeIds.length / totalNodes : 0;
    const isLargeMutation =
      regionNodeIds.length === totalNodes ||
      affectedShare > state.config.large_mutation_share_threshold;

    // Check if this is an explicit confirmation matching an existing proposal
    if (confirmPending && state.pending_proposal) {
      const proposal = state.pending_proposal;
      const sortedCurrent = [...regionNodeIds].sort().join(',');
      const sortedProposal = [...proposal.region_node_ids].sort().join(',');

      if (sortedCurrent === sortedProposal) {
        return { branch: 'direct' };
      }
    }

    // If large mutation share or full graph without matching confirmation -> Approval-Gate
    if (isLargeMutation) {
      const candidatePositions: Record<string, { x: number; y: number }> = {};
      for (const id of regionNodeIds) {
        const node = state.graph_nodes[id];
        candidatePositions[id] = { x: node.x, y: node.y };
      }

      const proposal: ProposedMutation = {
        tool_call_id: '',
        tool_name: 'minimize_edge_crossings',
        region_node_ids: regionNodeIds,
        candidate_positions: candidatePositions,
        initial_crossings: 0,
        candidate_crossings: 0,
        status: 'proposed',
      };

      return {
        branch: 'approval-gate',
        proposal,
      };
    }

    return { branch: 'direct' };
  }

  return { branch: 'direct' };
}

function handleApprovalGate(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  proposal: ProposedMutation,
  stateAccessor: DispatchStateAccessor,
  timestamp: number
): WebMCPToolResult {
  proposal.tool_call_id = toolCallId;

  // Save proposal to state
  let nextState = reducePendingProposal(stateAccessor.getState(), proposal);
  nextState = reduceInvocationLog(nextState, {
    tool_call_id: toolCallId,
    tool_name: toolName,
    args,
    timestamp,
  });

  const toolResultRecord: ToolResult = {
    tool_call_id: toolCallId,
    tool_name: toolName,
    success: true,
    status: 'proposed',
    result: {
      affected_node_ids: proposal.region_node_ids,
      crossings_before: proposal.initial_crossings ?? 0,
      crossings_after: proposal.candidate_crossings ?? 0,
    },
    error: null,
  };

  nextState = reduceToolArtifacts(nextState, {
    [toolCallId]: toolResultRecord,
  });

  stateAccessor.setState(nextState);

  // Emit approval events on activity bus
  activityBus.emit('tool-invocation-status', {
    tool_call_id: toolCallId,
    status: 'proposed',
    timestamp: Date.now(),
  });

  activityBus.emit('approval-required', {
    tool_call_id: toolCallId,
    region_node_ids: proposal.region_node_ids,
    preview: { candidate_positions: proposal.candidate_positions },
    timestamp: Date.now(),
  });

  activityBus.emit('tool-invocation-result', {
    tool_call_id: toolCallId,
    tool_name: toolName,
    success: true,
    status: 'proposed',
    result: toolResultRecord.result as Record<string, unknown>,
    timestamp: Date.now(),
  });

  return {
    success: true,
    status: 'proposed',
    result: toolResultRecord.result as Record<string, unknown>,
    error: null,
  };
}

function handleFailure(
  error: Error,
  toolCallId: string,
  toolName: string,
  stateAccessor: DispatchStateAccessor,
  timestamp: number
): WebMCPToolResult {
  const errorMessage = error.message || 'Unknown error occurred during tool dispatch.';

  // Step 6: Log error to state without modifying graph_nodes or graph_edges
  const currentState = stateAccessor.getState();
  const nextState = reduceErrorLogs(currentState, {
    tool_call_id: toolCallId,
    tool_name: toolName,
    error: errorMessage,
    timestamp,
  });
  stateAccessor.setState(nextState);

  activityBus.emit('tool-invocation-error', {
    tool_call_id: toolCallId,
    tool_name: toolName,
    success: false,
    error: errorMessage,
    timestamp: Date.now(),
  });

  return {
    success: false,
    result: null,
    error: errorMessage,
  };
}
