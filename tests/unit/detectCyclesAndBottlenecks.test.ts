import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import { handleDetectCyclesAndBottlenecks } from '../../src/tools/detectCyclesAndBottlenecks.js';
import {
  createInitialState,
  type GraphAgentState,
  type NodeRecord,
  type EdgeRecord,
} from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Node 2: detect_cycles_and_bottlenecks Tool Handler', () => {
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

  it('accurately identifies exact cyclic edges in a 3-node cyclic fixture with an outgoing tail', async () => {
    const customState = createInitialState();
    const nodes: Record<string, NodeRecord> = {
      nA: { id: 'nA', label: 'Node A', x: 0, y: 0, pinned: false, duration: 1 },
      nB: { id: 'nB', label: 'Node B', x: 10, y: 10, pinned: false, duration: 1 },
      nC: { id: 'nC', label: 'Node C', x: 20, y: 20, pinned: false, duration: 1 },
      nD: { id: 'nD', label: 'Node D', x: 30, y: 30, pinned: false, duration: 1 },
    };
    const edges: Record<string, EdgeRecord> = {
      e_ab: { id: 'e_ab', source_id: 'nA', target_id: 'nB', is_cyclic: null, is_critical: null },
      e_bc: { id: 'e_bc', source_id: 'nB', target_id: 'nC', is_cyclic: null, is_critical: null },
      e_ca: { id: 'e_ca', source_id: 'nC', target_id: 'nA', is_cyclic: null, is_critical: null },
      e_cd: { id: 'e_cd', source_id: 'nC', target_id: 'nD', is_cyclic: null, is_critical: null },
    };
    customState.graph_nodes = nodes;
    customState.graph_edges = edges;

    let localState = customState;
    const result = await handleDetectCyclesAndBottlenecks(
      {},
      {
        state: localState,
        setState: (s) => {
          localState = s;
        },
      }
    );

    // Exact cyclic edges in the cycle: e_ab, e_bc, e_ca
    expect(result.cyclic_edge_ids.sort()).toEqual(['e_ab', 'e_bc', 'e_ca'].sort());
    expect(result.cyclic_edge_ids).not.toContain('e_cd');

    // Verify state edge annotations
    expect(localState.graph_edges.e_ab.is_cyclic).toBe(true);
    expect(localState.graph_edges.e_bc.is_cyclic).toBe(true);
    expect(localState.graph_edges.e_ca.is_cyclic).toBe(true);
    expect(localState.graph_edges.e_cd.is_cyclic).toBe(false);
  });

  it('yields zero cyclic edges for a strictly acyclic DAG', async () => {
    const dagState = createInitialState();
    dagState.graph_nodes = {
      n1: { id: 'n1', label: 'Node 1', x: 0, y: 0, pinned: false },
      n2: { id: 'n2', label: 'Node 2', x: 10, y: 0, pinned: false },
      n3: { id: 'n3', label: 'Node 3', x: 20, y: 0, pinned: false },
    };
    dagState.graph_edges = {
      e12: { id: 'e12', source_id: 'n1', target_id: 'n2', is_cyclic: null },
      e23: { id: 'e23', source_id: 'n2', target_id: 'n3', is_cyclic: null },
      e13: { id: 'e13', source_id: 'n1', target_id: 'n3', is_cyclic: null },
    };

    let localState = dagState;
    const result = await handleDetectCyclesAndBottlenecks(
      {},
      {
        state: localState,
        setState: (s) => {
          localState = s;
        },
      }
    );

    expect(result.cyclic_edge_ids).toEqual([]);
    expect(localState.graph_edges.e12.is_cyclic).toBe(false);
    expect(localState.graph_edges.e23.is_cyclic).toBe(false);
    expect(localState.graph_edges.e13.is_cyclic).toBe(false);
  });

  it('dispatches detect_cycles_and_bottlenecks via dispatch cycle on seedGraph', async () => {
    const response = await dispatchToolCall('detect_cycles_and_bottlenecks', {}, stateAccessor);

    expect(response.success).toBe(true);
    expect(response.error).toBeNull();
    const result = response.result as any;

    // The order-service -> payment-service -> notification-service cycle must be detected
    expect(result.cyclic_edge_ids).toContain('e_order_payment');
    expect(result.cyclic_edge_ids).toContain('e_payment_notif');
    expect(result.cyclic_edge_ids).toContain('e_notif_order');

    // Acyclic edge must be marked false in state
    expect(state.graph_edges.e_gateway_auth.is_cyclic).toBe(false);
    expect(state.graph_edges.e_order_payment.is_cyclic).toBe(true);
  });

  it('correctly ranks order-service as #1 bottleneck based on degree centrality', async () => {
    const response = await dispatchToolCall('detect_cycles_and_bottlenecks', {}, stateAccessor);

    expect(response.success).toBe(true);
    const result = response.result as any;

    expect(result.bottleneck_nodes.length).toBeGreaterThan(0);
    // order-service has degree 8, the highest in the 16-node graph
    expect(result.bottleneck_nodes[0].node_id).toBe('order-service');
    expect(result.bottleneck_nodes[0].centrality_score).toBeGreaterThan(0);

    // Verify descending sort order
    for (let i = 0; i < result.bottleneck_nodes.length - 1; i++) {
      expect(result.bottleneck_nodes[i].centrality_score).toBeGreaterThanOrEqual(
        result.bottleneck_nodes[i + 1].centrality_score
      );
    }
  });

  it('guarantees graph_nodes layout and pinned status remain completely unchanged', async () => {
    const nodesSnapshotBefore = JSON.stringify(state.graph_nodes);
    const pinnedSnapshotBefore = JSON.stringify(Array.from(state.pinned_node_ids));

    const response = await dispatchToolCall('detect_cycles_and_bottlenecks', {}, stateAccessor);

    expect(response.success).toBe(true);
    expect(JSON.stringify(state.graph_nodes)).toBe(nodesSnapshotBefore);
    expect(JSON.stringify(Array.from(state.pinned_node_ids))).toBe(pinnedSnapshotBefore);

    // Only edge annotations and logs are written
    expect(state.invocation_log).toHaveLength(1);
    expect(Object.keys(state.tool_artifacts)).toHaveLength(1);
    expect(state.error_logs).toHaveLength(0);
  });
});
