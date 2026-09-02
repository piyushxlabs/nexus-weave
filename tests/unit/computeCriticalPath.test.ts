import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import { handleComputeCriticalPath } from '../../src/tools/computeCriticalPath.js';
import {
  createInitialState,
  type GraphAgentState,
  type NodeRecord,
  type EdgeRecord,
} from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Node 3: compute_critical_path Tool Handler', () => {
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

  it('computes exact longest path and total duration on a branching DAG fixture', async () => {
    const dagState = createInitialState();
    const nodes: Record<string, NodeRecord> = {
      n_start: { id: 'n_start', label: 'Start', x: 0, y: 0, pinned: false, duration: 10 },
      n_mid1: { id: 'n_mid1', label: 'Heavy Branch', x: 10, y: 0, pinned: false, duration: 25 },
      n_mid2: { id: 'n_mid2', label: 'Light Branch', x: 10, y: 10, pinned: false, duration: 15 },
      n_end: { id: 'n_end', label: 'End', x: 20, y: 0, pinned: false, duration: 30 },
    };
    const edges: Record<string, EdgeRecord> = {
      e1: { id: 'e1', source_id: 'n_start', target_id: 'n_mid1', is_cyclic: null, is_critical: null },
      e2: { id: 'e2', source_id: 'n_mid1', target_id: 'n_end', is_cyclic: null, is_critical: null },
      e3: { id: 'e3', source_id: 'n_start', target_id: 'n_mid2', is_cyclic: null, is_critical: null },
      e4: { id: 'e4', source_id: 'n_mid2', target_id: 'n_end', is_cyclic: null, is_critical: null },
    };
    dagState.graph_nodes = nodes;
    dagState.graph_edges = edges;

    let localState = dagState;
    const localAccessor = {
      getState: () => localState,
      setState: (s: GraphAgentState) => {
        localState = s;
      },
    };

    const response = await dispatchToolCall(
      'compute_critical_path',
      { duration_field: 'duration' },
      localAccessor
    );

    expect(response.success).toBe(true);
    expect(response.error).toBeNull();
    const result = response.result as any;

    // Path 1 (via n_mid1): 10 + 25 + 30 = 65
    // Path 2 (via n_mid2): 10 + 15 + 30 = 55
    expect(result.critical_path_node_ids).toEqual(['n_start', 'n_mid1', 'n_end']);
    expect(result.total_duration).toBe(65);

    // Verify edge annotations via pure reducer
    expect(localState.graph_edges.e1.is_critical).toBe(true);
    expect(localState.graph_edges.e2.is_critical).toBe(true);
    expect(localState.graph_edges.e3.is_critical).toBe(false);
    expect(localState.graph_edges.e4.is_critical).toBe(false);
  });

  it('fails cleanly on graphs containing cycles per Silence-Over-Guessing Policy', async () => {
    // seedGraph has an intentional circular cycle: order -> payment -> notification -> order
    const response = await dispatchToolCall(
      'compute_critical_path',
      { duration_field: 'duration' },
      stateAccessor
    );

    expect(response.success).toBe(false);
    expect(response.result).toBeNull();
    expect(response.error).toContain('Graph contains circular dependencies');
    expect(state.error_logs).toHaveLength(1);
    expect(state.error_logs[0].tool_name).toBe('compute_critical_path');
  });

  it('fails cleanly when duration_field does not exist on any node', async () => {
    const response = await dispatchToolCall(
      'compute_critical_path',
      { duration_field: 'non_existent_latency' },
      stateAccessor
    );

    expect(response.success).toBe(false);
    expect(response.result).toBeNull();
    expect(response.error).toContain("No node in the current graph has a value for duration_field 'non_existent_latency'");
    expect(state.error_logs).toHaveLength(1);
  });

  it('supports custom dynamic duration field names on DAGs', async () => {
    const dagState = createInitialState();
    dagState.graph_nodes = {
      n1: { id: 'n1', label: 'Node 1', x: 0, y: 0, pinned: false, execution_latency: 5 } as any,
      n2: { id: 'n2', label: 'Node 2', x: 10, y: 0, pinned: false, execution_latency: 12 } as any,
    };
    dagState.graph_edges = {
      e12: { id: 'e12', source_id: 'n1', target_id: 'n2', is_cyclic: null, is_critical: null },
    };

    let localState = dagState;
    const result = await handleComputeCriticalPath(
      { duration_field: 'execution_latency' },
      {
        state: localState,
        setState: (s) => {
          localState = s;
        },
      }
    );

    expect(result.critical_path_node_ids).toEqual(['n1', 'n2']);
    expect(result.total_duration).toBe(17);
    expect(localState.graph_edges.e12.is_critical).toBe(true);
  });

  it('guarantees graph_nodes layout and pinned status remain completely unchanged', async () => {
    const dagState = createInitialState();
    dagState.graph_nodes = {
      n1: { id: 'n1', label: 'Node 1', x: 100, y: 200, pinned: true, duration: 10 },
      n2: { id: 'n2', label: 'Node 2', x: 300, y: 400, pinned: false, duration: 20 },
    };
    dagState.graph_edges = {
      e12: { id: 'e12', source_id: 'n1', target_id: 'n2', is_cyclic: null, is_critical: null },
    };

    const nodesSnapshot = JSON.stringify(dagState.graph_nodes);
    let localState = dagState;
    const localAccessor = {
      getState: () => localState,
      setState: (s: GraphAgentState) => {
        localState = s;
      },
    };

    await dispatchToolCall(
      'compute_critical_path',
      { duration_field: 'duration' },
      localAccessor
    );

    expect(JSON.stringify(localState.graph_nodes)).toBe(nodesSnapshot);
  });
});
