/**
 * Node 3: compute_critical_path WebMCP Tool Handler.
 * Computes longest path over a DAG using topological sort and dynamic programming.
 * Enforces the Silence-Over-Guessing Policy on missing durations or cycles.
 * AGENT_MASTER_PLAN.md Section 5 / Step 11, AGENT_LOGIC_SPEC.md Section 4.
 */

import type { EdgeRecord, GraphAgentState } from '../state/schema.js';
import { reduceGraphEdges } from '../state/reducers.js';
import { activityBus } from '../ui/activityBus.js';
import {
  NexusWeaveError,
  MissingDurationFieldError,
  CycleDetectedInDAGError,
} from './dispatch.js';
import {
  COMPUTE_CRITICAL_PATH_NAME,
  type ComputeCriticalPathResult,
} from './schemas/computeCriticalPath.schema.js';

export interface ComputeCriticalPathHandlerContext {
  state: GraphAgentState;
  setState?: (nextState: GraphAgentState) => void;
  signal?: AbortSignal;
  tool_call_id?: string;
}

/**
 * Executes compute_critical_path.
 * Evaluates duration-bearing nodes, validates acyclicity, computes longest path via topological DP,
 * annotates `graph_edges[*].is_critical` via mergeByKey reducer, and returns { critical_path_node_ids, total_duration }.
 */
export async function handleComputeCriticalPath(
  args: Record<string, unknown>,
  context: ComputeCriticalPathHandlerContext
): Promise<ComputeCriticalPathResult> {
  const { state, setState } = context;
  const durationField = args.duration_field as string;

  const allNodes = Object.values(state.graph_nodes);
  const allEdges = Object.values(state.graph_edges);

  // 1. Validate duration field existence (Silence-Over-Guessing Policy)
  const durationBearingNodes: { id: string; duration: number }[] = [];
  for (const node of allNodes) {
    const val = (node as any)[durationField];
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      durationBearingNodes.push({ id: node.id, duration: val });
    }
  }

  if (durationBearingNodes.length === 0) {
    throw new MissingDurationFieldError(
      `No node in the current graph has a value for duration_field '${durationField}'; critical path cannot be computed.`
    );
  }

  const validNodeSet = new Set(durationBearingNodes.map((n) => n.id));
  const nodeDurationMap = new Map(durationBearingNodes.map((n) => [n.id, n.duration]));

  // Subgraph edges connecting duration-bearing nodes
  const subgraphEdges = allEdges.filter(
    (e) => validNodeSet.has(e.source_id) && validNodeSet.has(e.target_id)
  );

  // 2. Acyclicity Check (Cycle Detection on evaluated subgraph)
  const adj = new Map<string, { edgeId: string; targetId: string }[]>();
  const inDegree = new Map<string, number>();

  for (const { id } of durationBearingNodes) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of subgraphEdges) {
    adj.get(edge.source_id)!.push({ edgeId: edge.id, targetId: edge.target_id });
    inDegree.set(edge.target_id, inDegree.get(edge.target_id)! + 1);
  }

  // Kahn's algorithm for topological sorting and cycle detection
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);

    for (const { targetId } of adj.get(curr) || []) {
      const nextDeg = inDegree.get(targetId)! - 1;
      inDegree.set(targetId, nextDeg);
      if (nextDeg === 0) {
        queue.push(targetId);
      }
    }
  }

  if (topoOrder.length < durationBearingNodes.length) {
    throw new CycleDetectedInDAGError(
      `Graph contains circular dependencies in the evaluated subgraph; critical path cannot be computed on cyclic graphs. Run 'detect_cycles_and_bottlenecks' to identify cycles.`
    );
  }

  // 3. Dynamic Programming for Longest Path over DAG
  // dist[u]: max cumulative duration ending at u
  // prev[u]: { prevNodeId: string; edgeId: string }
  const dist = new Map<string, number>();
  const prev = new Map<string, { prevNodeId: string; edgeId: string } | null>();

  for (const { id, duration } of durationBearingNodes) {
    dist.set(id, duration);
    prev.set(id, null);
  }

  for (const u of topoOrder) {
    const currentDist = dist.get(u)!;
    for (const { edgeId, targetId } of adj.get(u) || []) {
      const targetDuration = nodeDurationMap.get(targetId)!;
      const candidateDist = currentDist + targetDuration;
      if (candidateDist > dist.get(targetId)!) {
        dist.set(targetId, candidateDist);
        prev.set(targetId, { prevNodeId: u, edgeId });
      }
    }
  }

  // Find node with maximum cumulative duration
  let maxDuration = -1;
  let endNodeId = '';

  for (const [nodeId, total] of dist.entries()) {
    if (total > maxDuration) {
      maxDuration = total;
      endNodeId = nodeId;
    } else if (total === maxDuration && nodeId < endNodeId) {
      // Deterministic tie-breaking by node ID
      endNodeId = nodeId;
    }
  }

  // Trace back longest path
  const criticalPathNodeIds: string[] = [];
  const criticalEdgeIdSet = new Set<string>();

  let currId: string | null = endNodeId;
  while (currId) {
    criticalPathNodeIds.unshift(currId);
    const prevInfo = prev.get(currId);
    if (prevInfo) {
      criticalEdgeIdSet.add(prevInfo.edgeId);
      currId = prevInfo.prevNodeId;
    } else {
      currId = null;
    }
  }

  // 4. State Edge Annotations: is_critical via pure mergeByKey reducer
  if (setState && allEdges.length > 0) {
    const edgeUpdates: Record<string, Partial<EdgeRecord>> = {};
    for (const edge of allEdges) {
      edgeUpdates[edge.id] = {
        is_critical: criticalEdgeIdSet.has(edge.id),
      };
    }

    const nextState = reduceGraphEdges(state, edgeUpdates);
    setState(nextState);

    // Emit in-page state update event
    activityBus.emit('state-update', {
      field: 'graph_edges',
      reducer: 'merge-by-key',
      changed_ids: Array.from(criticalEdgeIdSet),
      timestamp: Date.now(),
    });
  }

  return {
    critical_path_node_ids: criticalPathNodeIds,
    total_duration: Number(maxDuration.toFixed(4)),
  };
}

export { COMPUTE_CRITICAL_PATH_NAME };
