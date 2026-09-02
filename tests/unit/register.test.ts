import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getModelContext,
  isWebMCPSupported,
  createToolDefinitions,
  registerAllTools,
  setupWebMCPLifecycle,
} from '../../src/webmcp/register.js';
import type { ModelContext, WebMCPToolDefinition, RegisterToolOptions } from '../../src/webmcp/webmcp.d.js';
import { createInitialState, type GraphAgentState } from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';
import { initDefaultHandlers } from '../../src/tools/dispatch.js';

describe('Step 14: WebMCP Tool Registration Engine', () => {
  let state: GraphAgentState;
  let stateAccessor: { getState: () => GraphAgentState; setState: (s: GraphAgentState) => void };

  let originalDoc: unknown;
  let originalNav: unknown;

  beforeEach(() => {
    initDefaultHandlers();
    const seed = createSeedGraph();
    state = createInitialState();
    state.graph_nodes = seed.nodes;
    state.graph_edges = seed.edges;

    stateAccessor = {
      getState: () => state,
      setState: (next) => {
        state = next;
      },
    };

    const g = globalThis as any;
    originalDoc = g.document;
    originalNav = g.navigator;
    delete g.document;
    delete g.navigator;
  });

  afterEach(() => {
    const g = globalThis as any;
    if (originalDoc !== undefined) {
      g.document = originalDoc;
    } else {
      delete g.document;
    }

    if (originalNav !== undefined) {
      g.navigator = originalNav;
    } else {
      delete g.navigator;
    }
  });

  describe('Universal Dual Detection (getModelContext & isWebMCPSupported)', () => {
    it('returns null and false when neither document nor navigator exposes modelContext', () => {
      expect(getModelContext()).toBeNull();
      expect(isWebMCPSupported()).toBe(false);
    });

    it('detects modelContext on document surface', () => {
      const mockContext = { registerTool: () => {}, getTools: () => [] } as unknown as ModelContext;
      const g = globalThis as any;
      g.document = { modelContext: mockContext };

      expect(getModelContext()).toBe(mockContext);
      expect(isWebMCPSupported()).toBe(true);
    });

    it('detects modelContext on navigator surface when document.modelContext is absent', () => {
      const mockContext = { registerTool: () => {}, getTools: () => [] } as unknown as ModelContext;
      const g = globalThis as any;
      g.navigator = { modelContext: mockContext };

      expect(getModelContext()).toBe(mockContext);
      expect(isWebMCPSupported()).toBe(true);
    });
  });

  describe('createToolDefinitions Factory', () => {
    it('generates all 5 WebMCP tool definitions with wire-format inputSchema and rich annotations', () => {
      const tools = createToolDefinitions(stateAccessor);

      expect(tools).toHaveLength(5);
      const names = tools.map((t) => t.name);
      expect(names).toEqual([
        'get_graph_topology',
        'detect_cycles_and_bottlenecks',
        'compute_critical_path',
        'minimize_edge_crossings',
        'pin_and_group_region',
      ]);

      // Verify strict and inputSchema property on all 5 tools
      for (const tool of tools) {
        expect(tool.strict).toBe(true);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(typeof tool.execute).toBe('function');
      }

      // Verify annotations
      const getTopology = tools.find((t) => t.name === 'get_graph_topology')!;
      expect(getTopology.annotations?.readOnlyHint).toBe(true);
      expect(getTopology.annotations?.untrustedContentHint).toBe(true);

      const detectCycles = tools.find((t) => t.name === 'detect_cycles_and_bottlenecks')!;
      expect(detectCycles.annotations?.readOnlyHint).toBe(true);

      const computeCritical = tools.find((t) => t.name === 'compute_critical_path')!;
      expect(computeCritical.annotations?.readOnlyHint).toBe(true);

      const minimizeCrossings = tools.find((t) => t.name === 'minimize_edge_crossings')!;
      expect(minimizeCrossings.annotations?.readOnlyHint).toBe(false);

      const pinRegion = tools.find((t) => t.name === 'pin_and_group_region')!;
      expect(pinRegion.annotations?.readOnlyHint).toBe(false);
    });
  });

  describe('registerAllTools Engine', () => {
    it('throws an error if WebMCP is unsupported in current environment', () => {
      expect(() => registerAllTools(stateAccessor)).toThrowError(
        'WebMCP is not supported in this runtime environment'
      );
    });

    it('registers all 5 tools on the active modelContext surface with signal options', () => {
      const registeredTools: { tool: WebMCPToolDefinition; options?: RegisterToolOptions }[] = [];
      const mockContext: ModelContext = {
        registerTool: (tool, options) => {
          registeredTools.push({ tool, options });
        },
        getTools: () => registeredTools.map((r) => r.tool),
      };
      const g = globalThis as any;
      g.document = { modelContext: mockContext };

      const controller = new AbortController();
      const result = registerAllTools(stateAccessor, { signal: controller.signal });

      expect(result.registeredCount).toBe(5);
      expect(result.toolNames).toHaveLength(5);
      expect(registeredTools).toHaveLength(5);

      for (const reg of registeredTools) {
        expect(reg.options?.signal).toBe(controller.signal);
      }
    });

    it('executes tools via registered execute handler and returns structured response', async () => {
      const registeredTools: WebMCPToolDefinition[] = [];
      const mockContext: ModelContext = {
        registerTool: (tool) => {
          registeredTools.push(tool);
        },
        getTools: () => registeredTools,
      };
      const g = globalThis as any;
      g.document = { modelContext: mockContext };

      registerAllTools(stateAccessor);

      const getTopologyTool = registeredTools.find((t) => t.name === 'get_graph_topology')!;
      const executionResult = await getTopologyTool.execute({});

      expect(executionResult.success).toBe(true);
      expect(executionResult.error).toBeNull();
      const payload = executionResult.result as any;
      expect(Object.keys(payload.nodes)).toHaveLength(16);
      expect(Object.keys(payload.edges)).toHaveLength(23);
    });
  });

  describe('setupWebMCPLifecycle Lifecycle', () => {
    it('creates AbortController and registers all 5 tools with signal bound', () => {
      const registeredTools: { tool: WebMCPToolDefinition; options?: RegisterToolOptions }[] = [];
      const mockContext: ModelContext = {
        registerTool: (tool, options) => {
          registeredTools.push({ tool, options });
        },
        getTools: () => registeredTools.map((r) => r.tool),
      };
      const g = globalThis as any;
      g.document = { modelContext: mockContext };

      const lifecycle = setupWebMCPLifecycle(stateAccessor);

      expect(lifecycle.controller).toBeInstanceOf(AbortController);
      expect(lifecycle.tools).toHaveLength(5);
      expect(registeredTools).toHaveLength(5);
      expect(registeredTools[0].options?.signal).toBe(lifecycle.controller.signal);

      // Verify clean abort
      lifecycle.controller.abort();
      expect(lifecycle.controller.signal.aborted).toBe(true);
    });
  });
});
