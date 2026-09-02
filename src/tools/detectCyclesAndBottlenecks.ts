/**
 * Node 2: detect_cycles_and_bottlenecks WebMCP Tool Handler.
 * Identifies directed circular dependency cycles via Tarjan's / DFS cycle detection
 * and computes degree centrality scores to detect bottleneck nodes.
 * AGENT_MASTER_PLAN.md Section 5 / Step 10, AGENT_LOGIC_SPEC.md Section 4.
 */

import type { EdgeRecord, GraphAgentState } from '../state/schema.js';
import { reduceGraphEdges } from '../state/reducers.js';
import { activityBus } from '../ui/activityBus.js';
import {
  DETECT_CYCLES_AND_BOTTLENECKS_NAME,
  type DetectCyclesAndBottlenecksResult,
  type BottleneckNode,
} from './schemas/detectCyclesAndBottlenecks.schema.js';

export interface DetectCyclesHandlerContext {
  state: GraphAgentState;
  setState?: (nextState: GraphAgentState) => void;
  signal?: AbortSignal;
  tool_call_id?: string;
}

/**
 * Executes detect_cycles_and_bottlenecks.
 * Computes circular dependencies and high-centrality bottleneck nodes,
 * annotates `graph_edges[*].is_cyclic` via mergeByKey reducer,
 * and leaves `graph_nodes` layout completely untouched.
 */
export async function handleDetectCyclesAndBottlenecks(
  _args: Record<string, unknown>,
  context: DetectCyclesHandlerContext
): Promise<DetectCyclesAndBottlenecksResult> {
  const { state, setState } = context;
  const nodes = Object.values(state.graph_nodes);
  const edges = Object.values(state.graph_edges);

  // 1. Detect circular dependency edges via Tarjan's Strongly Connected Components
  const cyclicEdgeIds = findCyclicEdgeIds(nodes.map((n) => n.id), edges);
  const cyclicSet = new Set(cyclicEdgeIds);

  // 2. Compute degree centrality scores and bottleneck nodes
  const bottleneckNodes = computeBottlenecks(nodes.map((n) => n.id), edges);

  // 3. Annotate graph_edges with is_cyclic via pure reducer
  if (setState && edges.length > 0) {
    const edgeUpdates: Record<string, Partial<EdgeRecord>> = {};
    for (const edge of edges) {
      edgeUpdates[edge.id] = {
        is_cyclic: cyclicSet.has(edge.id),
      };
    }

    const nextState = reduceGraphEdges(state, edgeUpdates);
    setState(nextState);

    // Emit in-page state update event
    activityBus.emit('state-update', {
      field: 'graph_edges',
      reducer: 'merge-by-key',
      changed_ids: cyclicEdgeIds,
      timestamp: Date.now(),
    });
  }

  return {
    cyclic_edge_ids: cyclicEdgeIds,
    bottleneck_nodes: bottleneckNodes,
  };
}

/**
 * Uses Tarjan's Strongly Connected Components (SCC) algorithm to identify
 * all edges participating in directed cycles.
 */
function findCyclicEdgeIds(nodeIds: string[], edges: EdgeRecord[]): string[] {
  if (nodeIds.length === 0 || edges.length === 0) {
    return [];
  }

  // Build outgoing adjacency list
  const adj = new Map<string, { edgeId: string; targetId: string }[]>();
  for (const id of nodeIds) {
    adj.set(id, []);
  }

  for (const edge of edges) {
    if (adj.has(edge.source_id)) {
      adj.get(edge.source_id)!.push({
        edgeId: edge.id,
        targetId: edge.target_id,
      });
    }
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(nodeId: string) {
    indices.set(nodeId, index);
    lowlink.set(nodeId, index);
    index++;
    stack.push(nodeId);
    onStack.add(nodeId);

    const outgoing = adj.get(nodeId) || [];
    for (const { targetId } of outgoing) {
      if (!indices.has(targetId)) {
        strongconnect(targetId);
        lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(targetId)!));
      } else if (onStack.has(targetId)) {
        lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, indices.get(targetId)!));
      }
    }

    if (lowlink.get(nodeId) === indices.get(nodeId)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== nodeId);
      sccs.push(scc);
    }
  }

  for (const id of nodeIds) {
    if (!indices.has(id)) {
      strongconnect(id);
    }
  }

  // Identify non-trivial SCCs (either length > 1, or length == 1 with self-loop)
  const nodeToSccId = new Map<string, number>();
  sccs.forEach((scc, sccId) => {
    let isNonTrivial = scc.length > 1;
    if (!isNonTrivial && scc.length === 1) {
      // Check for self-loop
      const singleNode = scc[0];
      const hasSelfLoop = edges.some(
        (e) => e.source_id === singleNode && e.target_id === singleNode
      );
      if (hasSelfLoop) {
        isNonTrivial = true;
      }
    }

    if (isNonTrivial) {
      for (const node of scc) {
        nodeToSccId.set(node, sccId);
      }
    }
  });

  // An edge is cyclic if both its source and target belong to the same non-trivial SCC
  const cyclicEdgeIds: string[] = [];
  for (const edge of edges) {
    const srcScc = nodeToSccId.get(edge.source_id);
    const tgtScc = nodeToSccId.get(edge.target_id);
    if (srcScc !== undefined && tgtScc !== undefined && srcScc === tgtScc) {
      cyclicEdgeIds.push(edge.id);
    }
  }

  return cyclicEdgeIds.sort();
}

/**
 * Computes degree centrality and identifies high-centrality bottleneck nodes.
 */
function computeBottlenecks(nodeIds: string[], edges: EdgeRecord[]): BottleneckNode[] {
  const nodeCount = nodeIds.length;
  if (nodeCount === 0) return [];

  const degreeMap = new Map<string, number>();
  for (const id of nodeIds) {
    degreeMap.set(id, 0);
  }

  for (const edge of edges) {
    if (degreeMap.has(edge.source_id)) {
      degreeMap.set(edge.source_id, degreeMap.get(edge.source_id)! + 1);
    }
    if (degreeMap.has(edge.target_id)) {
      degreeMap.set(edge.target_id, degreeMap.get(edge.target_id)! + 1);
    }
  }

  const denominator = nodeCount > 1 ? 2 * (nodeCount - 1) : 1;
  const meanDegree = (2 * edges.length) / nodeCount;
  const thresholdDegree = Math.max(2, Math.ceil(meanDegree));

  const bottlenecks: BottleneckNode[] = [];
  for (const [id, degree] of degreeMap.entries()) {
    if (degree >= thresholdDegree) {
      const score = Number((degree / denominator).toFixed(4));
      bottlenecks.push({
        node_id: id,
        centrality_score: score,
      });
    }
  }

  // Sort descending by centrality score, tie-break by node_id ascending
  bottlenecks.sort((a, b) => {
    if (b.centrality_score !== a.centrality_score) {
      return b.centrality_score - a.centrality_score;
    }
    return a.node_id.localeCompare(b.node_id);
  });

  return bottlenecks;
}

export { DETECT_CYCLES_AND_BOTTLENECKS_NAME };
