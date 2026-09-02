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
} from './webmcp.d.js';
import { dispatchToolCall, type DispatchStateAccessor } from '../tools/dispatch.js';

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
 * Checks if the WebMCP Imperative API is available in the current browser runtime.
 */
export function isWebMCPSupported(): boolean {
  return getModelContext() !== null;
}

/**
 * Creates definitions for all 5 WebMCP tools wired to dispatchToolCall.
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
      execute: async (args, context) => {
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
      execute: async (args, context) => {
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
      execute: async (args, context) => {
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
      execute: async (args, context) => {
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
      execute: async (args, context) => {
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
 * Registers all 5 WebMCP tools against the active ModelContext.
 */
export function registerAllTools(
  stateAccessor: DispatchStateAccessor,
  options?: RegisterToolOptions
): RegisterAllToolsResult {
  const context = getModelContext();
  if (!context) {
    throw new Error('WebMCP is not supported in this runtime environment (getModelContext() is null).');
  }

  const tools = createToolDefinitions(stateAccessor, options?.signal);

  for (const tool of tools) {
    context.registerTool(tool, options);
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
