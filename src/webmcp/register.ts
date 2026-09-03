/**
 * WebMCP Tool Registration Engine.
 * Registers all 5 Nexus Weave tools against document.modelContext or navigator.modelContext.
 * Binds lifecycle to an AbortController for clean teardown on navigation.
 * AGENT_MASTER_PLAN.md Section 4 / Step 7 & Section 10 / Step 14.
 */

import type {
  ModelContext,
  WebMCPToolDefinition,
  RegisterToolOptions,
  WebMCPExecutionContext,
} from './webmcp.d.js';
import {
  dispatchToolCall,
  normalizeToolArguments,
  type DispatchStateAccessor,
} from '../tools/dispatch.js';

export { normalizeToolArguments };

import {
  GET_GRAPH_TOPOLOGY_NAME,
  getGraphTopologyMetadata,
} from '../tools/schemas/getGraphTopology.schema.js';

import {
  DETECT_CYCLES_AND_BOTTLENECKS_NAME,
  detectCyclesAndBottlenecksMetadata,
} from '../tools/schemas/detectCyclesAndBottlenecks.schema.js';

import {
  COMPUTE_CRITICAL_PATH_NAME,
  computeCriticalPathMetadata,
} from '../tools/schemas/computeCriticalPath.schema.js';

import {
  MINIMIZE_EDGE_CROSSINGS_NAME,
  minimizeEdgeCrossingsMetadata,
} from '../tools/schemas/minimizeEdgeCrossings.schema.js';

import {
  PIN_AND_GROUP_REGION_NAME,
  pinAndGroupRegionMetadata,
} from '../tools/schemas/pinAndGroupRegion.schema.js';

/**
 * Universal dual-detection helper.
 * Resolves modelContext across document.modelContext and navigator.modelContext.
 */
export function getModelContext(): ModelContext | null {
  if (typeof document !== 'undefined' && document.modelContext) {
    return document.modelContext;
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return navigator.modelContext;
  }
  return null;
}

/**
 * Resolves all available modelContext surfaces (document.modelContext and navigator.modelContext).
 * Deduplicates if document.modelContext and navigator.modelContext point to the same object reference.
 */
export function getAvailableModelContexts(): ModelContext[] {
  const contexts: ModelContext[] = [];
  const seen = new Set<ModelContext>();

  if (typeof document !== 'undefined' && document.modelContext) {
    contexts.push(document.modelContext);
    seen.add(document.modelContext);
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext && !seen.has(navigator.modelContext)) {
    contexts.push(navigator.modelContext);
    seen.add(navigator.modelContext);
  }
  return contexts;
}

/**
 * Checks if the WebMCP Imperative API is available in the current browser runtime.
 */
export function isWebMCPSupported(): boolean {
  return getModelContext() !== null;
}

/**
 * Creates definitions for all 5 WebMCP tools wired to dispatchToolCall with defensive argument normalization.
 */
export function createToolDefinitions(
  stateAccessor: DispatchStateAccessor,
  defaultSignal?: AbortSignal
): WebMCPToolDefinition[] {
  return [
    {
      name: GET_GRAPH_TOPOLOGY_NAME,
      description: getGraphTopologyMetadata.description,
      strict: true,
      annotations: getGraphTopologyMetadata.annotations,
      inputSchema: getGraphTopologyMetadata.inputSchema as Record<string, unknown>,
      execute: async (rawArgs: unknown, context?: WebMCPExecutionContext) => {
        const args = normalizeToolArguments(rawArgs);
        return dispatchToolCall(GET_GRAPH_TOPOLOGY_NAME, args, stateAccessor, {
          signal: context?.signal ?? defaultSignal,
          toolCallId: context?.toolCallId,
        });
      },
    },
    {
      name: DETECT_CYCLES_AND_BOTTLENECKS_NAME,
      description: detectCyclesAndBottlenecksMetadata.description,
      strict: true,
      annotations: detectCyclesAndBottlenecksMetadata.annotations,
      inputSchema: detectCyclesAndBottlenecksMetadata.inputSchema as Record<string, unknown>,
      execute: async (rawArgs: unknown, context?: WebMCPExecutionContext) => {
        const args = normalizeToolArguments(rawArgs);
        return dispatchToolCall(DETECT_CYCLES_AND_BOTTLENECKS_NAME, args, stateAccessor, {
          signal: context?.signal ?? defaultSignal,
          toolCallId: context?.toolCallId,
        });
      },
    },
    {
      name: COMPUTE_CRITICAL_PATH_NAME,
      description: computeCriticalPathMetadata.description,
      strict: true,
      annotations: computeCriticalPathMetadata.annotations,
      inputSchema: computeCriticalPathMetadata.inputSchema as Record<string, unknown>,
      execute: async (rawArgs: unknown, context?: WebMCPExecutionContext) => {
        const args = normalizeToolArguments(rawArgs);
        return dispatchToolCall(COMPUTE_CRITICAL_PATH_NAME, args, stateAccessor, {
          signal: context?.signal ?? defaultSignal,
          toolCallId: context?.toolCallId,
        });
      },
    },
    {
      name: MINIMIZE_EDGE_CROSSINGS_NAME,
      description: minimizeEdgeCrossingsMetadata.description,
      strict: true,
      annotations: minimizeEdgeCrossingsMetadata.annotations,
      inputSchema: minimizeEdgeCrossingsMetadata.inputSchema as Record<string, unknown>,
      execute: async (rawArgs: unknown, context?: WebMCPExecutionContext) => {
        const args = normalizeToolArguments(rawArgs);
        return dispatchToolCall(MINIMIZE_EDGE_CROSSINGS_NAME, args, stateAccessor, {
          signal: context?.signal ?? defaultSignal,
          toolCallId: context?.toolCallId,
        });
      },
    },
    {
      name: PIN_AND_GROUP_REGION_NAME,
      description: pinAndGroupRegionMetadata.description,
      strict: true,
      annotations: pinAndGroupRegionMetadata.annotations,
      inputSchema: pinAndGroupRegionMetadata.inputSchema as Record<string, unknown>,
      execute: async (rawArgs: unknown, context?: WebMCPExecutionContext) => {
        const args = normalizeToolArguments(rawArgs);
        return dispatchToolCall(PIN_AND_GROUP_REGION_NAME, args, stateAccessor, {
          signal: context?.signal ?? defaultSignal,
          toolCallId: context?.toolCallId,
        });
      },
    },
  ];
}

export interface RegisterAllToolsResult {
  registeredCount: number;
  toolNames: string[];
  tools: WebMCPToolDefinition[];
}

/**
 * Registers all 5 WebMCP tools against all active ModelContext surfaces.
 * Executes on both document.modelContext and navigator.modelContext if present,
 * without throwing duplicate registration errors.
 */
export function registerAllTools(
  stateAccessor: DispatchStateAccessor,
  options?: RegisterToolOptions
): RegisterAllToolsResult {
  const contexts = getAvailableModelContexts();
  if (contexts.length === 0) {
    throw new Error('WebMCP is not supported in this runtime environment (getModelContext() is null).');
  }

  const tools = createToolDefinitions(stateAccessor, options?.signal);

  for (const context of contexts) {
    for (const tool of tools) {
      try {
        context.registerTool(tool, options);
      } catch (err: unknown) {
        // Defensive: ignore duplicate registration errors across surfaces
        const errorMsg = String((err as any)?.message ?? err).toLowerCase();
        if (
          errorMsg.includes('already') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('exists')
        ) {
          continue;
        }
        throw err;
      }
    }
  }

  return {
    registeredCount: tools.length,
    toolNames: tools.map((t) => t.name),
    tools,
  };
}

export interface LifecycleSetupResult {
  controller: AbortController;
  tools: WebMCPToolDefinition[];
}

/**
 * Wires the AbortController lifecycle and registers all tools.
 * Aborts cleanly on page teardown (pagehide/beforeunload).
 */
export function setupWebMCPLifecycle(
  stateAccessor: DispatchStateAccessor
): LifecycleSetupResult {
  const controller = new AbortController();

  const registration = registerAllTools(stateAccessor, {
    signal: controller.signal,
  });

  if (typeof window !== 'undefined') {
    const handleTeardown = () => {
      controller.abort();
    };
    window.addEventListener('beforeunload', handleTeardown, { once: true });
    window.addEventListener('pagehide', handleTeardown, { once: true });
  }

  return {
    controller,
    tools: registration.tools,
  };
}
