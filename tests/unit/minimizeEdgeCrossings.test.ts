import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import {
  doSegmentsIntersect,
  countCrossings,
  solveEdgeCrossingMinimization,
} from '../../src/tools/minimizeEdgeCrossings.js';
import {
  createInitialState,
  type GraphAgentState,
  type NodeRecord,
  type EdgeRecord,
} from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Node 4: minimize_edge_crossings Tool Handler', () => {
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

  describe('Geometric Segment Crossing Logic', () => {
    it('accurately identifies crossing line segments', () => {
      const p1 = { x: 0, y: 100 };
      const p2 = { x: 200, y: 0 };
      const p3 = { x: 0, y: 0 };
      const p4 = { x: 200, y: 100 };

      // Line 1: (0, 100) -> (200, 0) crosses Line 2: (0, 0) -> (200, 100) at (100, 50)
      expect(doSegmentsIntersect(p1, p2, p3, p4)).toBe(true);
    });

    it('does not register incident edges sharing an endpoint as a crossing', () => {
      const shared = { x: 100, y: 100 };
      const pA = { x: 0, y: 100 };
      const pB = { x: 200, y: 100 };

      expect(doSegmentsIntersect(shared, pA, shared, pB)).toBe(false);
    });

    it('counts exact crossings in a 4-node tangled X layout', () => {
      const nodes = {
        n1: { x: 0, y: 100 },
        n2: { x: 0, y: 0 },
        n3: { x: 200, y: 0 },
        n4: { x: 200, y: 100 },
      };
      const edges = [
        { id: 'e1', source_id: 'n1', target_id: 'n3' },
        { id: 'e2', source_id: 'n2', target_id: 'n4' },
      ];

      expect(countCrossings(nodes, edges)).toBe(1);

      // Swapping n1 and n2 untangles the edges
      const untangled = {
        n1: { x: 0, y: 0 },
        n2: { x: 0, y: 100 },
        n3: { x: 200, y: 0 },
        n4: { x: 200, y: 100 },
      };
      expect(countCrossings(untangled, edges)).toBe(0);
    });
  });

  describe('Direct Execution and Crossing Reduction', () => {
    it('strictly reduces edge crossings on a tangled region fixture (crossings_after <= crossings_before)', async () => {
      const tangledState = createInitialState();
      // 10 nodes to keep 4-node region within the 35% threshold
      const nodes: Record<string, NodeRecord> = {
        n1: { id: 'n1', label: 'Node 1', x: 0, y: 100, pinned: false },
        n2: { id: 'n2', label: 'Node 2', x: 0, y: 0, pinned: false },
        n3: { id: 'n3', label: 'Node 3', x: 200, y: 0, pinned: false },
        n4: { id: 'n4', label: 'Node 4', x: 200, y: 100, pinned: false },
        bg1: { id: 'bg1', label: 'BG 1', x: 400, y: 0, pinned: false },
        bg2: { id: 'bg2', label: 'BG 2', x: 400, y: 50, pinned: false },
        bg3: { id: 'bg3', label: 'BG 3', x: 400, y: 100, pinned: false },
        bg4: { id: 'bg4', label: 'BG 4', x: 400, y: 150, pinned: false },
        bg5: { id: 'bg5', label: 'BG 5', x: 400, y: 200, pinned: false },
        bg6: { id: 'bg6', label: 'BG 6', x: 400, y: 250, pinned: false },
        bg7: { id: 'bg7', label: 'BG 7', x: 400, y: 300, pinned: false },
        bg8: { id: 'bg8', label: 'BG 8', x: 400, y: 350, pinned: false },
      };
      const edges: Record<string, EdgeRecord> = {
        e1: { id: 'e1', source_id: 'n1', target_id: 'n3', is_cyclic: null },
        e2: { id: 'e2', source_id: 'n2', target_id: 'n4', is_cyclic: null },
      };
      tangledState.graph_nodes = nodes;
      tangledState.graph_edges = edges;

      let localState = tangledState;
      const localAccessor = {
        getState: () => localState,
        setState: (s: GraphAgentState) => {
          localState = s;
        },
      };

      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: ['n1', 'n2', 'n3', 'n4'] },
        localAccessor
      );

      expect(response.success).toBe(true);
      expect(response.status).toBe('applied');
      const result = response.result as any;

      expect(result.crossings_before).toBe(1);
      expect(result.crossings_after).toBe(0);
      expect(result.crossings_after).toBeLessThanOrEqual(result.crossings_before);

      // Verify node positions were atomically updated
      expect(localState.graph_nodes.n1.y).not.toBe(100);
    });

    it('leaves unpinned nodes outside region_node_ids completely untouched', async () => {
      const customState = createInitialState();
      const nodes: Record<string, NodeRecord> = {
        r1: { id: 'r1', label: 'Region 1', x: 0, y: 100, pinned: false },
        r2: { id: 'r2', label: 'Region 2', x: 0, y: 0, pinned: false },
        out1: { id: 'out1', label: 'Outside 1', x: 500, y: 600, pinned: false },
        out2: { id: 'out2', label: 'Outside 2', x: 700, y: 800, pinned: false },
        bg1: { id: 'bg1', label: 'BG 1', x: 10, y: 10, pinned: false },
        bg2: { id: 'bg2', label: 'BG 2', x: 20, y: 20, pinned: false },
        bg3: { id: 'bg3', label: 'BG 3', x: 30, y: 30, pinned: false },
        bg4: { id: 'bg4', label: 'BG 4', x: 40, y: 40, pinned: false },
      };
      customState.graph_nodes = nodes;
      customState.graph_edges = {};

      let localState = customState;
      const localAccessor = {
        getState: () => localState,
        setState: (s: GraphAgentState) => {
          localState = s;
        },
      };

      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: ['r1', 'r2'] },
        localAccessor
      );

      expect(response.success).toBe(true);
      expect(localState.graph_nodes.out1.x).toBe(500);
      expect(localState.graph_nodes.out1.y).toBe(600);
      expect(localState.graph_nodes.out2.x).toBe(700);
      expect(localState.graph_nodes.out2.y).toBe(800);
    });
  });

  describe('Pinned Node Protection & Guardrails', () => {
    it('throws PinnedConflictError when all targeted nodes are pinned', async () => {
      const pinnedState = createInitialState();
      pinnedState.graph_nodes = {
        p1: { id: 'p1', label: 'Pinned 1', x: 10, y: 10, pinned: true },
        p2: { id: 'p2', label: 'Pinned 2', x: 20, y: 20, pinned: true },
      };
      pinnedState.pinned_node_ids = new Set(['p1', 'p2']);

      let localState = pinnedState;
      const localAccessor = {
        getState: () => localState,
        setState: (s: GraphAgentState) => {
          localState = s;
        },
      };

      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: ['p1', 'p2'] },
        localAccessor
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('all specified nodes are pinned');
      expect(localState.graph_nodes.p1.x).toBe(10);
      expect(localState.graph_nodes.p2.x).toBe(20);
      expect(localState.error_logs).toHaveLength(1);
    });

    it('preserves coordinates of pinned nodes when a mixed pinned/unpinned region is provided', () => {
      const mixedState = createInitialState();
      mixedState.graph_nodes = {
        p1: { id: 'p1', label: 'Pinned', x: 100, y: 100, pinned: true },
        u1: { id: 'u1', label: 'Unpinned', x: 200, y: 200, pinned: false },
      };
      mixedState.pinned_node_ids = new Set(['p1']);

      const solution = solveEdgeCrossingMinimization(mixedState, ['p1', 'u1']);
      expect(solution.affectedNodeIds).toEqual(['u1']);
      expect(solution.candidatePositions.p1).toBeUndefined();
    });
  });

  describe('Approval-Gate Routing & Two-Turn Confirmation', () => {
    it('routes large-share mutation to Approval-Gate (status: proposed) without modifying graph_nodes', async () => {
      const allNodeIds = Object.keys(state.graph_nodes);
      const snapshotBefore = JSON.stringify(state.graph_nodes);

      const response = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: allNodeIds },
        stateAccessor
      );

      expect(response.success).toBe(true);
      expect(response.status).toBe('proposed');
      expect(state.pending_proposal).not.toBeNull();
      expect(state.pending_proposal?.tool_name).toBe('minimize_edge_crossings');
      expect(state.pending_proposal?.status).toBe('proposed');

      // graph_nodes must remain 100% UNTOUCHED
      expect(JSON.stringify(state.graph_nodes)).toBe(snapshotBefore);
    });

    it('commits candidate positions when confirmed with confirm_pending: true on matching proposal', async () => {
      const allNodeIds = Object.keys(state.graph_nodes);

      // Turn 1: Proposal
      const propResponse = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: allNodeIds },
        stateAccessor
      );
      expect(propResponse.status).toBe('proposed');
      expect(state.pending_proposal).not.toBeNull();

      // Turn 2: Confirmation
      const confirmResponse = await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: allNodeIds, confirm_pending: true },
        stateAccessor
      );

      expect(confirmResponse.success).toBe(true);
      expect(confirmResponse.status).toBe('applied');
      // Proposal must be cleared
      expect(state.pending_proposal).toBeNull();
    });
  });
});
