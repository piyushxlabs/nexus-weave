/**
 * Pure state reducer functions for Nexus Weave.
 * All state mutations strictly flow through these functions per AGENT_ORCHESTRATION_BLUEPRINT.md Section 3.
 */

import type {
  GraphAgentState,
  NodeRecord,
  EdgeRecord,
  ToolInvocationRecord,
  ToolResult,
  ProposedMutation,
  ErrorRecord,
} from './schema.js';

/**
 * Generic merge-by-key reducer.
 * Merges partial updates into a record map without mutating the original map or unrelated entries.
 */
export function mergeByKey<T extends Record<string, any>>(
  current: Record<string, T>,
  updates: Record<string, Partial<T>>
): Record<string, T> {
  const result: Record<string, T> = { ...current };
  for (const [key, partialUpdate] of Object.entries(updates)) {
    if (key in result) {
      result[key] = {
        ...result[key],
        ...partialUpdate,
      };
    } else {
      result[key] = { ...partialUpdate } as T;
    }
  }
  return result;
}

/**
 * Append-only reducer.
 * Appends a new item to an immutable list without modifying the input array or dropping previous entries.
 */
export function appendOnly<T>(list: readonly T[], item: T): T[] {
  return [...list, item];
}

/**
 * Last-write-wins reducer.
 * Completely replaces the current value with the new value.
 */
export function lastWriteWins<T>(_current: T, next: T): T {
  return next;
}

// ============================================================================
// State-Level Reducer Action Dispatchers
// ============================================================================

/**
 * Updates graph nodes position and/or pinned/duration fields via merge-by-key.
 * Structural identity (id, label) is preserved.
 */
export function reduceGraphNodes(
  state: GraphAgentState,
  updates: Record<string, Partial<NodeRecord>>
): GraphAgentState {
  // Only existing nodes can be updated
  const filteredUpdates: Record<string, Partial<NodeRecord>> = {};
  for (const [id, update] of Object.entries(updates)) {
    if (id in state.graph_nodes) {
      const existing = state.graph_nodes[id];
      filteredUpdates[id] = {
        ...update,
        id: existing.id,
        label: existing.label,
      };
    }
  }

  return {
    ...state,
    graph_nodes: mergeByKey(state.graph_nodes, filteredUpdates),
  };
}

/**
 * Updates graph edge annotation fields (is_cyclic, is_critical) via merge-by-key.
 * Structural identity (id, source_id, target_id) is immutable.
 */
export function reduceGraphEdges(
  state: GraphAgentState,
  updates: Record<string, Partial<EdgeRecord>>
): GraphAgentState {
  const filteredUpdates: Record<string, Partial<EdgeRecord>> = {};
  for (const [id, update] of Object.entries(updates)) {
    if (id in state.graph_edges) {
      const existing = state.graph_edges[id];
      filteredUpdates[id] = {
        ...update,
        id: existing.id,
        source_id: existing.source_id,
        target_id: existing.target_id,
      };
    }
  }

  return {
    ...state,
    graph_edges: mergeByKey(state.graph_edges, filteredUpdates),
  };
}

/**
 * Updates pinned node IDs via last-write-wins.
 */
export function reducePinnedNodeIds(
  state: GraphAgentState,
  nextPinned: Set<string>
): GraphAgentState {
  return {
    ...state,
    pinned_node_ids: lastWriteWins(state.pinned_node_ids, new Set(nextPinned)),
  };
}

/**
 * Updates tool artifacts via merge-by-key.
 */
export function reduceToolArtifacts(
  state: GraphAgentState,
  updates: Record<string, ToolResult>
): GraphAgentState {
  return {
    ...state,
    tool_artifacts: mergeByKey(state.tool_artifacts, updates),
  };
}

/**
 * Updates pending proposal via last-write-wins.
 */
export function reducePendingProposal(
  state: GraphAgentState,
  proposal: ProposedMutation | null
): GraphAgentState {
  return {
    ...state,
    pending_proposal: lastWriteWins(state.pending_proposal, proposal),
  };
}

/**
 * Appends to tool invocation log via append-only.
 */
export function reduceInvocationLog(
  state: GraphAgentState,
  record: ToolInvocationRecord
): GraphAgentState {
  return {
    ...state,
    invocation_log: appendOnly(state.invocation_log, record),
    last_tool_invocation: lastWriteWins(state.last_tool_invocation, record),
  };
}

/**
 * Appends to error logs via append-only.
 */
export function reduceErrorLogs(
  state: GraphAgentState,
  error: ErrorRecord
): GraphAgentState {
  return {
    ...state,
    error_logs: appendOnly(state.error_logs, error),
  };
}
