import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import {
  createInitialState,
  type GraphAgentState,
} from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Node 5: pin_and_group_region Tool Handler', () => {
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

  it('pins specified nodes into pinned_node_ids and updates graph_nodes[*].pinned to true', async () => {
    const targetIds = ['api-gateway', 'auth-service'];

    const response = await dispatchToolCall(
      'pin_and_group_region',
      { node_ids: targetIds, pinned: true },
      stateAccessor
    );

    expect(response.success).toBe(true);
    expect(response.error).toBeNull();
    const result = response.result as any;

    expect(result.updated_node_ids).toEqual(targetIds);
    expect(result.pinned).toBe(true);

    // Verify pinned_node_ids Set
    expect(state.pinned_node_ids.has('api-gateway')).toBe(true);
    expect(state.pinned_node_ids.has('auth-service')).toBe(true);

    // Verify graph_nodes record flags
    expect(state.graph_nodes['api-gateway'].pinned).toBe(true);
    expect(state.graph_nodes['auth-service'].pinned).toBe(true);
    expect(state.graph_nodes['catalog-service'].pinned).toBe(false);
  });

  it('unpins specified nodes from pinned_node_ids and updates graph_nodes[*].pinned to false', async () => {
    // First pin two nodes
    await dispatchToolCall(
      'pin_and_group_region',
      { node_ids: ['api-gateway', 'auth-service'], pinned: true },
      stateAccessor
    );

    expect(state.pinned_node_ids.has('api-gateway')).toBe(true);
    expect(state.pinned_node_ids.has('auth-service')).toBe(true);

    // Unpin one of the nodes
    const unpinResponse = await dispatchToolCall(
      'pin_and_group_region',
      { node_ids: ['api-gateway'], pinned: false },
      stateAccessor
    );

    expect(unpinResponse.success).toBe(true);
    expect(state.pinned_node_ids.has('api-gateway')).toBe(false);
    expect(state.graph_nodes['api-gateway'].pinned).toBe(false);

    // Other node remains pinned
    expect(state.pinned_node_ids.has('auth-service')).toBe(true);
    expect(state.graph_nodes['auth-service'].pinned).toBe(true);
  });

  it('enforces all-or-nothing validation, aborting on any unknown node ID with zero partial updates', async () => {
    expect(state.pinned_node_ids.has('api-gateway')).toBe(false);

    const response = await dispatchToolCall(
      'pin_and_group_region',
      { node_ids: ['api-gateway', 'unknown-ghost-service'], pinned: true },
      stateAccessor
    );

    expect(response.success).toBe(false);
    expect(response.result).toBeNull();
    expect(response.error).toContain("Cannot pin/unpin unknown node 'unknown-ghost-service'");

    // All-or-nothing: api-gateway must NOT be partially pinned
    expect(state.pinned_node_ids.has('api-gateway')).toBe(false);
    expect(state.graph_nodes['api-gateway'].pinned).toBe(false);
    expect(state.error_logs).toHaveLength(1);
  });

  it('guarantees node coordinates (x, y), durations, and labels remain completely unchanged', async () => {
    const coordsBefore = Object.values(state.graph_nodes).map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      duration: n.duration,
      label: n.label,
    }));

    await dispatchToolCall(
      'pin_and_group_region',
      { node_ids: ['order-service', 'payment-service'], pinned: true },
      stateAccessor
    );

    const coordsAfter = Object.values(state.graph_nodes).map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      duration: n.duration,
      label: n.label,
    }));

    expect(coordsAfter).toEqual(coordsBefore);
  });

  it('records invocation in invocation_log and stores artifact in tool_artifacts', async () => {
    const response = await dispatchToolCall(
      'pin_and_group_region',
      { node_ids: ['inventory-service'], pinned: true },
      stateAccessor
    );

    expect(response.success).toBe(true);
    expect(state.invocation_log).toHaveLength(1);
    expect(state.invocation_log[0].tool_name).toBe('pin_and_group_region');
    expect(Object.keys(state.tool_artifacts)).toHaveLength(1);
  });
});
