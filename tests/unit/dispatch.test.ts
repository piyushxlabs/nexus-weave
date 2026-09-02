import { describe, it, expect, beforeEach } from 'vitest';
import {
  dispatchToolCall,
  registerToolHandler,
  clearToolHandlersForTesting,
  resetConcurrencyLockForTesting,
  NexusWeaveError,
  SchemaValidationError,
  UnknownNodeError,
  PinnedConflictError,
  ConcurrencyLockError,
  AbortError,
} from '../../src/tools/dispatch.js';
import { createInitialState, type GraphAgentState } from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';
import { activityBus, type ActivityEventDetailMap } from '../../src/ui/activityBus.js';

describe('6-Step Deterministic Dispatch Engine', () => {
  let state: GraphAgentState;
  let stateAccessor: { getState: () => GraphAgentState; setState: (s: GraphAgentState) => void };

  beforeEach(() => {
    clearToolHandlersForTesting();
    resetConcurrencyLockForTesting();

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
  });

  describe('Error Hierarchy', () => {
    it('all custom error types inherit from NexusWeaveError', () => {
      expect(new SchemaValidationError('test')).toBeInstanceOf(NexusWeaveError);
      expect(new UnknownNodeError('test')).toBeInstanceOf(NexusWeaveError);
      expect(new PinnedConflictError('test')).toBeInstanceOf(NexusWeaveError);
      expect(new ConcurrencyLockError()).toBeInstanceOf(NexusWeaveError);
      expect(new AbortError()).toBeInstanceOf(NexusWeaveError);
    });
  });

  describe('Direct Execution Path', () => {
    it('executes read-only tool successfully and emits start & result events', async () => {
      const events: string[] = [];
      const unsubStart = activityBus.subscribe('tool-invocation-start', () => {
        events.push('start');
      });
      const unsubResult = activityBus.subscribe('tool-invocation-result', () => {
        events.push('result');
      });

      registerToolHandler('get_graph_topology', async () => {
        return { count: 16 };
      });

      const response = await dispatchToolCall('get_graph_topology', {}, stateAccessor);

      unsubStart();
      unsubResult();

      expect(response.success).toBe(true);
      expect(response.result).toEqual({ count: 16 });
      expect(events).toEqual(['start', 'result']);
      expect(state.invocation_log).toHaveLength(1);
    });

    it('executes clearly-scoped mutating tool with status: applied', async () => {
      registerToolHandler('pin_and_group_region', async (args) => {
        return { pinned_count: (args.node_ids as string[]).length };
      });

      const response = await dispatchToolCall(
        'pin_and_group_region',
        { node_ids: ['api-gateway'], pinned: true },
        stateAccessor
      );

      expect(response.success).toBe(true);
      expect(response.status).toBe('applied');
      expect(response.result).toEqual({ pinned_count: 1 });
    });
  });

  describe('Failure Path (Step 6)', () => {
    it('schema validation failure short-circuits to Step 6 without mutating state', async () => {
      let errorEventDetail: any = null;
      const unsub = activityBus.subscribe('tool-invocation-error', (evt) => {
        errorEventDetail = evt.detail;
      });

      // compute_critical_path requires duration_field
      const response = await dispatchToolCall('compute_critical_path', {}, stateAccessor);

      unsub();

      expect(response.success).toBe(false);
      expect(response.result).toBeNull();
      expect(response.error).toContain("Schema validation failed for 'compute_critical_path'");
      expect(state.error_logs).toHaveLength(1);
      expect(errorEventDetail).not.toBeNull();
      expect(errorEventDetail.error).toContain('Schema validation failed');
    });

    it('rejects unknown node IDs with UnknownNodeError', async () => {
      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: ['phantom-node-404'] },
        stateAccessor
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain("Target node 'phantom-node-404' does not exist in graph_nodes");
      expect(state.error_logs).toHaveLength(1);
    });

    it('aborts when all target nodes are pinned (PinnedConflictError)', async () => {
      state.pinned_node_ids = new Set(['auth-service']);

      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: ['auth-service'] },
        stateAccessor
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('No valid unpinned nodes in target region; all specified nodes are pinned.');
      expect(state.error_logs).toHaveLength(1);
    });
  });

  describe('Approval-Gate Routing', () => {
    it('routes large mutation exceeding threshold to Approval-Gate with status: proposed', async () => {
      let approvalDetail: any = null;
      const unsub = activityBus.subscribe('approval-required', (evt) => {
        approvalDetail = evt.detail;
      });

      // 8 nodes is 50% of the 16-node graph, well exceeding the 0.35 threshold
      const regionIds = [
        'api-gateway',
        'auth-service',
        'user-service',
        'catalog-service',
        'pricing-service',
        'order-service',
        'inventory-service',
        'payment-service',
      ];

      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: regionIds },
        stateAccessor
      );

      unsub();

      expect(response.success).toBe(true);
      expect(response.status).toBe('proposed');
      expect(state.pending_proposal).not.toBeNull();
      expect(state.pending_proposal?.region_node_ids).toEqual(regionIds);
      expect(approvalDetail).not.toBeNull();
      expect(approvalDetail.region_node_ids).toEqual(regionIds);
    });
  });

  describe('In-Flight Concurrency Lock', () => {
    it('blocks a second concurrent mutating call with ConcurrencyLockError', async () => {
      let resolveFirstCall: () => void;
      const firstCallPromise = new Promise<void>((res) => {
        resolveFirstCall = res;
      });

      registerToolHandler('minimize_edge_crossings', async () => {
        await firstCallPromise;
        return { done: true };
      });

      // Start first mutating call (will hang until resolveFirstCall is called)
      const call1Promise = dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: ['api-gateway'] },
        stateAccessor
      );

      // Attempt second mutating call while first is in-flight
      const call2Response = await dispatchToolCall(
        'pin_and_group_region',
        { node_ids: ['user-service'], pinned: true },
        stateAccessor
      );

      expect(call2Response.success).toBe(false);
      expect(call2Response.error).toBe('A mutating operation is already in flight. Concurrency limit is 1.');

      // Release first call
      resolveFirstCall!();
      const call1Response = await call1Promise;
      expect(call1Response.success).toBe(true);
    });
  });

  describe('AbortSignal Handling', () => {
    it('short-circuits to failure path when AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const response = await dispatchToolCall(
        'get_graph_topology',
        {},
        stateAccessor,
        { signal: controller.signal }
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('Operation aborted by host context signal.');
    });
  });
});
