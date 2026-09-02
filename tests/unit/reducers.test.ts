import { describe, it, expect } from 'vitest';
import {
  mergeByKey,
  appendOnly,
  lastWriteWins,
  reduceGraphNodes,
  reduceGraphEdges,
  reducePinnedNodeIds,
  reducePendingProposal,
  reduceInvocationLog,
  reduceErrorLogs,
} from '../../src/state/reducers.js';
import {
  createInitialState,
  DEFAULT_CONFIG,
  type NodeRecord,
  type EdgeRecord,
  type ProposedMutation,
  type ToolInvocationRecord,
  type ErrorRecord,
} from '../../src/state/schema.js';
import { createSeedGraph, SEED_NODES, SEED_EDGES } from '../../src/state/seedGraph.js';

describe('State Reducers', () => {
  describe('appendOnly', () => {
    it('appends items without modifying original array or dropping entries', () => {
      const initial: readonly string[] = ['entry1'];
      const first = appendOnly(initial, 'entry2');
      const second = appendOnly(first, 'entry3');

      expect(initial).toEqual(['entry1']);
      expect(first).toEqual(['entry1', 'entry2']);
      expect(second).toEqual(['entry1', 'entry2', 'entry3']);
      expect(second.length).toBe(3);
    });
  });

  describe('mergeByKey', () => {
    it('merges partial properties without altering unrelated keys or mutating input', () => {
      const original = {
        n1: { id: 'n1', x: 10, y: 20, pinned: false },
        n2: { id: 'n2', x: 30, y: 40, pinned: true },
      };

      const result = mergeByKey(original, {
        n1: { x: 15 },
      });

      expect(result.n1).toEqual({ id: 'n1', x: 15, y: 20, pinned: false });
      expect(result.n2).toEqual({ id: 'n2', x: 30, y: 40, pinned: true });
      expect(original.n1.x).toBe(10); // Immutability
    });

    it('adds new keys if they did not previously exist', () => {
      const original = { a: { val: 1 } };
      const result = mergeByKey(original, { b: { val: 2 } });
      expect(result).toEqual({ a: { val: 1 }, b: { val: 2 } });
    });
  });

  describe('lastWriteWins', () => {
    it('returns the next value unconditionally', () => {
      expect(lastWriteWins('old', 'new')).toBe('new');
      expect(lastWriteWins(100, 200)).toBe(200);
      expect(lastWriteWins({ active: true }, { active: false })).toEqual({ active: false });
      expect(lastWriteWins({ state: 1 }, null)).toBeNull();
    });
  });

  describe('reduceGraphNodes', () => {
    it('updates position and pinned flags while keeping id and label immutable', () => {
      const state = createInitialState();
      state.graph_nodes = {
        n1: { id: 'n1', label: 'Original Label', x: 10, y: 20, pinned: false, duration: 5 },
      };

      const updated = reduceGraphNodes(state, {
        n1: {
          x: 50,
          y: 60,
          pinned: true,
          // Attempting to overwrite id or label must be ignored
          id: 'hacked_id' as any,
          label: 'Hacked Label' as any,
        },
      });

      expect(updated.graph_nodes.n1.x).toBe(50);
      expect(updated.graph_nodes.n1.y).toBe(60);
      expect(updated.graph_nodes.n1.pinned).toBe(true);
      expect(updated.graph_nodes.n1.id).toBe('n1');
      expect(updated.graph_nodes.n1.label).toBe('Original Label');
    });

    it('ignores updates for non-existent node IDs', () => {
      const state = createInitialState();
      state.graph_nodes = {
        n1: { id: 'n1', label: 'N1', x: 0, y: 0, pinned: false },
      };

      const updated = reduceGraphNodes(state, {
        unknown: { x: 999 },
      });

      expect(updated.graph_nodes.unknown).toBeUndefined();
    });
  });

  describe('reduceGraphEdges', () => {
    it('updates annotation flags without altering id, source_id, or target_id', () => {
      const state = createInitialState();
      state.graph_edges = {
        e1: { id: 'e1', source_id: 'n1', target_id: 'n2', is_cyclic: null, is_critical: null },
      };

      const updated = reduceGraphEdges(state, {
        e1: {
          is_cyclic: true,
          is_critical: false,
          source_id: 'hacked_source' as any,
        },
      });

      expect(updated.graph_edges.e1.is_cyclic).toBe(true);
      expect(updated.graph_edges.e1.is_critical).toBe(false);
      expect(updated.graph_edges.e1.source_id).toBe('n1');
    });
  });

  describe('reducePinnedNodeIds', () => {
    it('replaces pinned node IDs via last-write-wins', () => {
      const state = createInitialState();
      state.pinned_node_ids = new Set(['n1', 'n2']);

      const updated = reducePinnedNodeIds(state, new Set(['n2', 'n3']));
      expect(Array.from(updated.pinned_node_ids)).toEqual(['n2', 'n3']);
    });
  });

  describe('reducePendingProposal', () => {
    it('sets proposal and clears proposal via last-write-wins', () => {
      const state = createInitialState();
      const proposal: ProposedMutation = {
        tool_call_id: 'call_1',
        tool_name: 'minimize_edge_crossings',
        region_node_ids: ['n1', 'n2'],
        candidate_positions: { n1: { x: 10, y: 20 } },
        status: 'proposed',
      };

      const withProposal = reducePendingProposal(state, proposal);
      expect(withProposal.pending_proposal).toEqual(proposal);

      const cleared = reducePendingProposal(withProposal, null);
      expect(cleared.pending_proposal).toBeNull();
    });
  });

  describe('reduceInvocationLog & reduceErrorLogs', () => {
    it('appends records cleanly', () => {
      const state = createInitialState();
      const invRecord: ToolInvocationRecord = {
        tool_call_id: 'call_1',
        tool_name: 'get_graph_topology',
        args: {},
        timestamp: Date.now(),
      };
      const errRecord: ErrorRecord = {
        error: 'Test error',
        timestamp: Date.now(),
      };

      const step1 = reduceInvocationLog(state, invRecord);
      expect(step1.invocation_log).toHaveLength(1);
      expect(step1.last_tool_invocation).toEqual(invRecord);

      const step2 = reduceErrorLogs(step1, errRecord);
      expect(step2.error_logs).toHaveLength(1);
      expect(step2.error_logs[0]).toEqual(errRecord);
    });
  });
});

describe('Seed Graph Validation', () => {
  it('contains 15-20 nodes with valid positions, durations, and labels', () => {
    const { nodes, edges } = createSeedGraph();
    const nodeCount = Object.keys(nodes).length;

    expect(nodeCount).toBeGreaterThanOrEqual(15);
    expect(nodeCount).toBeLessThanOrEqual(20);

    for (const [id, node] of Object.entries(nodes)) {
      expect(node.id).toBe(id);
      expect(typeof node.label).toBe('string');
      expect(node.label.length).toBeGreaterThan(0);
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(typeof node.pinned).toBe('boolean');
      expect(typeof node.duration).toBe('number');
      expect(node.duration!).toBeGreaterThan(0);
    }

    expect(Object.keys(edges).length).toBeGreaterThan(15);
  });

  it('contains the intentional circular dependency cycle: order-service -> payment-service -> notification-service -> order-service', () => {
    const { edges } = createSeedGraph();
    const edgeValues = Object.values(edges);

    const orderToPayment = edgeValues.find(
      (e) => e.source_id === 'order-service' && e.target_id === 'payment-service'
    );
    const paymentToNotif = edgeValues.find(
      (e) => e.source_id === 'payment-service' && e.target_id === 'notification-service'
    );
    const notifToOrder = edgeValues.find(
      (e) => e.source_id === 'notification-service' && e.target_id === 'order-service'
    );

    expect(orderToPayment).toBeDefined();
    expect(paymentToNotif).toBeDefined();
    expect(notifToOrder).toBeDefined();
  });
});
