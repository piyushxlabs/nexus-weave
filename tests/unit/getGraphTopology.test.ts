import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import { handleGetGraphTopology } from '../../src/tools/getGraphTopology.js';
import { createInitialState, type GraphAgentState } from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Node 1: get_graph_topology Tool Handler', () => {
  let state: GraphAgentState;
  let stateAccessor: { getState: () => GraphAgentState; setState: (s: GraphAgentState) => void };

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
  });

  it('directly executes handleGetGraphTopology and returns matching snapshot', async () => {
    const result = await handleGetGraphTopology({}, { state });

    expect(result.nodes).toHaveLength(16);
    expect(result.edges).toHaveLength(23);
    expect(result.pinned_node_ids).toEqual([]);

    // Check specific known node
    const apiGateway = result.nodes.find((n) => n.id === 'api-gateway');
    expect(apiGateway).toBeDefined();
    expect(apiGateway?.label).toBe('API Gateway');
    expect(apiGateway?.x).toBe(90);
    expect(apiGateway?.y).toBe(460);
    expect(apiGateway?.duration).toBe(15);
  });

  it('dispatches get_graph_topology via 6-step dispatch and returns full topology', async () => {
    const response = await dispatchToolCall('get_graph_topology', {}, stateAccessor);

    expect(response.success).toBe(true);
    expect(response.error).toBeNull();
    expect(response.result).toBeDefined();

    const result = response.result as any;
    expect(result.nodes).toHaveLength(16);
    expect(result.edges).toHaveLength(23);
    expect(result.pinned_node_ids).toEqual([]);
  });

  it('accurately reflects pinned nodes in snapshot', async () => {
    state.pinned_node_ids = new Set(['auth-service', 'user-service']);

    const response = await dispatchToolCall('get_graph_topology', {}, stateAccessor);

    expect(response.success).toBe(true);
    const result = response.result as any;
    expect(result.pinned_node_ids).toContain('auth-service');
    expect(result.pinned_node_ids).toContain('user-service');
    expect(result.pinned_node_ids).toHaveLength(2);
  });

  it('guarantees absolute state immutability for graph structures', async () => {
    const nodesBefore = JSON.stringify(state.graph_nodes);
    const edgesBefore = JSON.stringify(state.graph_edges);
    const pinnedBefore = JSON.stringify(Array.from(state.pinned_node_ids));

    const response = await dispatchToolCall('get_graph_topology', {}, stateAccessor);

    expect(response.success).toBe(true);
    expect(JSON.stringify(state.graph_nodes)).toBe(nodesBefore);
    expect(JSON.stringify(state.graph_edges)).toBe(edgesBefore);
    expect(JSON.stringify(Array.from(state.pinned_node_ids))).toBe(pinnedBefore);

    // Only tool_artifacts and invocation_log are modified
    expect(state.invocation_log).toHaveLength(1);
    expect(state.invocation_log[0].tool_name).toBe('get_graph_topology');
    expect(Object.keys(state.tool_artifacts)).toHaveLength(1);
    expect(state.error_logs).toHaveLength(0);
  });

  it('preserves user-authored labels strictly as untrusted display text', async () => {
    state.graph_nodes['api-gateway'] = {
      ...state.graph_nodes['api-gateway'],
      label: '<script>alert("hack")</script>',
    };

    const response = await dispatchToolCall('get_graph_topology', {}, stateAccessor);

    expect(response.success).toBe(true);
    const result = response.result as any;
    const gateway = result.nodes.find((n: any) => n.id === 'api-gateway');
    expect(gateway.label).toBe('<script>alert("hack")</script>');
  });

});
