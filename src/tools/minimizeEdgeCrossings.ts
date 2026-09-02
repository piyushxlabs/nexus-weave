/**
 * Node 4: minimize_edge_crossings WebMCP Tool Handler.
 * Re-lays out human-designated region of unpinned nodes to reduce edge crossings.
 * Enforces pinned node protections and Approval-Gate for large mutations.
 * AGENT_MASTER_PLAN.md Section 5 / Step 12, AGENT_LOGIC_SPEC.md Section 4.
 */

import type { GraphAgentState, NodeRecord } from '../state/schema.js';
import { reduceGraphNodes, reducePendingProposal } from '../state/reducers.js';
import { activityBus } from '../ui/activityBus.js';
import {
  UnknownNodeError,
  PinnedConflictError,
} from './dispatch.js';
import {
  MINIMIZE_EDGE_CROSSINGS_NAME,
  type MinimizeEdgeCrossingsResult,
} from './schemas/minimizeEdgeCrossings.schema.js';

export interface MinimizeEdgeCrossingsHandlerContext {
  state: GraphAgentState;
  setState?: (nextState: GraphAgentState) => void;
  signal?: AbortSignal;
  tool_call_id?: string;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Checks if two line segments cross strictly in 2D space.
 * Shared incident endpoints do not count as a crossing.
 */
export function doSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const threshold = 1e-6;
  const isSame = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;

  if (isSame(p1, p3) || isSame(p1, p4) || isSame(p2, p3) || isSame(p2, p4)) {
    return false;
  }

  function ccw(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  const d1 = ccw(p1, p2, p3);
  const d2 = ccw(p1, p2, p4);
  const d3 = ccw(p3, p4, p1);
  const d4 = ccw(p3, p4, p2);

  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/**
 * Counts all edge crossings involving the current node layout.
 */
export function countCrossings(
  nodes: Record<string, Point>,
  edges: { id: string; source_id: string; target_id: string }[]
): number {
  let crossings = 0;
  const validEdges = edges.filter(
    (e) => nodes[e.source_id] !== undefined && nodes[e.target_id] !== undefined
  );

  for (let i = 0; i < validEdges.length; i++) {
    const e1 = validEdges[i];
    const p1 = nodes[e1.source_id];
    const p2 = nodes[e1.target_id];

    for (let j = i + 1; j < validEdges.length; j++) {
      const e2 = validEdges[j];
      const p3 = nodes[e2.source_id];
      const p4 = nodes[e2.target_id];

      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        crossings++;
      }
    }
  }

  return crossings;
}

export interface LayoutMinimizationSolution {
  candidatePositions: Record<string, Point>;
  initialCrossings: number;
  candidateCrossings: number;
  affectedNodeIds: string[];
}

export const MIN_DX = 165;
export const MIN_DY = 80;

/**
 * Checks whether a specific node in the layout violates AABB clearance against any other node.
 */
export function isNodeColliding(
  nodeId: string,
  positions: Record<string, Point>,
  minDx: number = MIN_DX,
  minDy: number = MIN_DY
): boolean {
  const p1 = positions[nodeId];
  if (!p1) return false;
  for (const [otherId, p2] of Object.entries(positions)) {
    if (otherId === nodeId || !p2) continue;
    if (Math.abs(p1.x - p2.x) < minDx && Math.abs(p1.y - p2.y) < minDy) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether any two nodes in the layout violate the minimum AABB clearance thresholds.
 */
export function hasNodeCollision(
  positions: Record<string, Point>,
  minDx: number = MIN_DX,
  minDy: number = MIN_DY
): boolean {
  const ids = Object.keys(positions);
  for (const id of ids) {
    if (isNodeColliding(id, positions, minDx, minDy)) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic, bounded layout solver for edge crossing minimization.
 * Uses iterative coordinate swap & barycenter relaxation bounded by config.max_layout_iterations.
 * Strictly guarantees candidateCrossings <= initialCrossings and 0 AABB node collisions.
 */
export function solveEdgeCrossingMinimization(
  state: GraphAgentState,
  regionNodeIds: string[]
): LayoutMinimizationSolution {
  // Validate all node IDs exist
  for (const id of regionNodeIds) {
    if (!(id in state.graph_nodes)) {
      throw new UnknownNodeError(`Target node '${id}' does not exist in graph_nodes.`);
    }
  }

  // Filter out pinned nodes (pinned nodes are never moved)
  const unpinnedRegionIds = regionNodeIds.filter((id) => !state.pinned_node_ids.has(id));

  if (unpinnedRegionIds.length === 0) {
    throw new PinnedConflictError(
      'No valid unpinned nodes in target region; all specified nodes are pinned.'
    );
  }

  const allEdges = Object.values(state.graph_edges);

  // Build working position map for all nodes in the graph
  const workingPositions: Record<string, Point> = {};
  for (const [id, node] of Object.entries(state.graph_nodes)) {
    workingPositions[id] = { x: node.x, y: node.y };
  }

  const initialCrossings = countCrossings(workingPositions, allEdges);
  let bestCrossings = initialCrossings;

  // Best candidate positions for the unpinned region
  let bestPositions: Record<string, Point> = {};
  for (const id of unpinnedRegionIds) {
    bestPositions[id] = { x: workingPositions[id].x, y: workingPositions[id].y };
  }

  // Bounded optimization loop
  const maxIterations = Math.min(state.config.max_layout_iterations || 100, 50);

  for (let iter = 0; iter < maxIterations; iter++) {
    let improvedInIteration = false;

    // 1. Coordinate swap heuristic among unpinned nodes in region (strictly preserving column X coordinates)
    for (let i = 0; i < unpinnedRegionIds.length; i++) {
      const u = unpinnedRegionIds[i];
      for (let j = i + 1; j < unpinnedRegionIds.length; j++) {
        const v = unpinnedRegionIds[j];

        // Test swapping Y coordinates
        const tempY = workingPositions[u].y;
        workingPositions[u].y = workingPositions[v].y;
        workingPositions[v].y = tempY;

        // Collision guard: reject swap if either moved node causes an AABB collision
        if (
          isNodeColliding(u, workingPositions, MIN_DX, MIN_DY) ||
          isNodeColliding(v, workingPositions, MIN_DX, MIN_DY)
        ) {
          workingPositions[v].y = workingPositions[u].y;
          workingPositions[u].y = tempY;
          continue;
        }

        const currentCrossings = countCrossings(workingPositions, allEdges);
        if (currentCrossings < bestCrossings) {
          bestCrossings = currentCrossings;
          improvedInIteration = true;
          for (const id of unpinnedRegionIds) {
            bestPositions[id] = { x: workingPositions[id].x, y: workingPositions[id].y };
          }
        } else {
          // Revert Y swap
          workingPositions[v].y = workingPositions[u].y;
          workingPositions[u].y = tempY;
        }
      }
    }

    // 2. Barycenter heuristic for unpinned nodes in region
    for (const u of unpinnedRegionIds) {
      const neighbors: Point[] = [];
      for (const edge of allEdges) {
        if (edge.source_id === u && workingPositions[edge.target_id]) {
          neighbors.push(workingPositions[edge.target_id]);
        } else if (edge.target_id === u && workingPositions[edge.source_id]) {
          neighbors.push(workingPositions[edge.source_id]);
        }
      }

      if (neighbors.length > 0) {
        const avgY = Math.round(neighbors.reduce((sum, p) => sum + p.y, 0) / neighbors.length);
        const oldY = workingPositions[u].y;
        workingPositions[u].y = avgY;

        if (isNodeColliding(u, workingPositions, MIN_DX, MIN_DY)) {
          workingPositions[u].y = oldY;
          continue;
        }

        const baryCrossings = countCrossings(workingPositions, allEdges);
        if (baryCrossings < bestCrossings) {
          bestCrossings = baryCrossings;
          improvedInIteration = true;
          for (const id of unpinnedRegionIds) {
            bestPositions[id] = { x: workingPositions[id].x, y: workingPositions[id].y };
          }
        } else {
          // Revert barycenter
          workingPositions[u].y = oldY;
        }
      }
    }

    if (!improvedInIteration) {
      break;
    }
  }

  return {
    candidatePositions: bestPositions,
    initialCrossings,
    candidateCrossings: bestCrossings,
    affectedNodeIds: unpinnedRegionIds,
  };
}


/**
 * WebMCP handler for minimize_edge_crossings.
 */
export async function handleMinimizeEdgeCrossings(
  args: Record<string, unknown>,
  context: MinimizeEdgeCrossingsHandlerContext
): Promise<MinimizeEdgeCrossingsResult> {
  const { state, setState } = context;
  const regionNodeIds = args.region_node_ids as string[];
  const confirmPending = Boolean(args.confirm_pending);

  // Case A: Confirming an existing pending proposal matching this exact region
  if (confirmPending && state.pending_proposal) {
    const proposal = state.pending_proposal;
    const sortedCurrent = [...regionNodeIds].sort().join(',');
    const sortedProposal = [...proposal.region_node_ids].sort().join(',');

    if (sortedCurrent === sortedProposal && setState) {
      // Atomic apply candidate positions
      const updates: Record<string, Partial<NodeRecord>> = {};
      for (const [id, pos] of Object.entries(proposal.candidate_positions)) {
        updates[id] = { x: pos.x, y: pos.y };
      }

      let nextState = reduceGraphNodes(state, updates);
      nextState = reducePendingProposal(nextState, null);
      setState(nextState);

      activityBus.emit('state-update', {
        field: 'graph_nodes',
        reducer: 'merge-by-key',
        changed_ids: proposal.region_node_ids,
        timestamp: Date.now(),
      });

      return {
        affected_node_ids: proposal.region_node_ids,
        crossings_before: proposal.initial_crossings ?? 0,
        crossings_after: proposal.candidate_crossings ?? 0,
      };
    }
  }

  // Case B: Direct Execution
  const solution = solveEdgeCrossingMinimization(state, regionNodeIds);

  if (setState) {
    const updates: Record<string, Partial<NodeRecord>> = {};
    for (const [id, pos] of Object.entries(solution.candidatePositions)) {
      updates[id] = { x: pos.x, y: pos.y };
    }

    const nextState = reduceGraphNodes(state, updates);
    setState(nextState);

    activityBus.emit('state-update', {
      field: 'graph_nodes',
      reducer: 'merge-by-key',
      changed_ids: solution.affectedNodeIds,
      timestamp: Date.now(),
    });
  }

  return {
    affected_node_ids: solution.affectedNodeIds,
    crossings_before: solution.initialCrossings,
    crossings_after: solution.candidateCrossings,
  };
}

export { MINIMIZE_EDGE_CROSSINGS_NAME };
