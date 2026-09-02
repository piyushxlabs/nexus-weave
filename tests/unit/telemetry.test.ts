import { describe, it, expect, beforeEach } from 'vitest';
import { activityLogger, InMemoryActivityLogger } from '../../src/telemetry/activityLog.js';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import { createInitialState, type GraphAgentState } from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Step 17: In-Memory Telemetry Log (activityLog.ts)', () => {
  let state: GraphAgentState;
  let stateAccessor: { getState: () => GraphAgentState; setState: (s: GraphAgentState) => void };

  beforeEach(() => {
    initDefaultHandlers();
    activityLogger.clear();

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

  describe('InMemoryActivityLogger Unit Behavior', () => {
    it('creates and updates spans conforming to OpenTelemetry GenAI semantics', () => {
      const logger = new InMemoryActivityLogger();

      logger.recordStart('call_1', 'get_graph_topology', { param: 'test' }, 1000);
      let spans = logger.getSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]['gen_ai.operation.name']).toBe('execute_tool');
      expect(spans[0]['tool.name']).toBe('get_graph_topology');
      expect(spans[0]['tool.call_id']).toBe('call_1');
      expect(spans[0].status).toBe('in_progress');
      expect(spans[0].timestamp_start).toBe(1000);

      logger.recordResult('call_1', 'get_graph_topology', { count: 16 }, 'applied', 1050);
      spans = logger.getSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status).toBe('completed');
      expect(spans[0].timestamp_end).toBe(1050);
      expect(spans[0].duration_ms).toBe(50);
      expect(spans[0].result).toEqual({ count: 16 });
    });

    it('records error spans with duration and message', () => {
      const logger = new InMemoryActivityLogger();

      logger.recordStart('call_err', 'compute_critical_path', {}, 2000);
      logger.recordError('call_err', 'compute_critical_path', 'Graph has cycles.', 2030);

      const spans = logger.getSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status).toBe('error');
      expect(spans[0].error).toBe('Graph has cycles.');
      expect(spans[0].duration_ms).toBe(30);
    });

    it('caps maximum stored spans to prevent unbounded memory growth', () => {
      const logger = new InMemoryActivityLogger(5);

      for (let i = 0; i < 10; i++) {
        logger.recordStart(`call_${i}`, 'tool_test', {}, Date.now());
      }

      expect(logger.getSpans().length).toBe(5);
    });
  });

  describe('Integration with 6-Step Dispatch Cycle', () => {
    it('automatically records telemetry spans during direct tool execution', async () => {
      await dispatchToolCall('get_graph_topology', {}, stateAccessor);

      const spans = activityLogger.getSpans();
      expect(spans.length).toBeGreaterThanOrEqual(1);

      const span = spans.find((s) => s['tool.name'] === 'get_graph_topology');
      expect(span).toBeDefined();
      expect(span!['gen_ai.operation.name']).toBe('execute_tool');
      expect(span!.status).toBe('completed');
      expect(span!.result).toBeDefined();
      expect(typeof span!.duration_ms).toBe('number');
    });

    it('records proposal status when mutation triggers Approval-Gate', async () => {
      const allNodeIds = Object.keys(state.graph_nodes);
      await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: allNodeIds },
        stateAccessor
      );

      const spans = activityLogger.getSpans();
      const span = spans.find((s) => s['tool.name'] === 'minimize_edge_crossings');

      expect(span).toBeDefined();
      expect(span!.status).toBe('proposed');
      expect(span!.result).toBeDefined();
    });

    it('records error span on validation failure', async () => {
      await dispatchToolCall(
        'compute_critical_path',
        { duration_field: 9999 } as any,
        stateAccessor
      );

      const spans = activityLogger.getSpans();
      const span = spans.find((s) => s['tool.name'] === 'compute_critical_path');

      expect(span).toBeDefined();
      expect(span!.status).toBe('error');
      expect(span!.error).toBeDefined();
    });
  });
});
