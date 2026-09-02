/**
 * Node 1: get_graph_topology WebMCP Tool Handler.
 * Returns a read-only snapshot of current graph topology (nodes, edges, pinned status).
 * AGENT_MASTER_PLAN.md Section 5 / Step 9, AGENT_LOGIC_SPEC.md Section 4.
 */

import type { GraphAgentState } from '../state/schema.js';
import {
  GET_GRAPH_TOPOLOGY_NAME,
  type GetGraphTopologyResult,
} from './schemas/getGraphTopology.schema.js';

export interface GetGraphTopologyHandlerContext {
  state: GraphAgentState;
  setState?: (nextState: GraphAgentState) => void;
  signal?: AbortSignal;
  tool_call_id?: string;
}

/**
 * Executes get_graph_topology.
 * Pure read-only operation: returns current graph state without any mutations.
 */
export async function handleGetGraphTopology(
  _args: Record<string, unknown>,
  context: GetGraphTopologyHandlerContext
): Promise<GetGraphTopologyResult> {
  const { state } = context;

  // Shallow copy nodes and edges to avoid external mutation leaks
  const nodes = Object.values(state.graph_nodes).map((node) => ({ ...node }));
  const edges = Object.values(state.graph_edges).map((edge) => ({ ...edge }));
  const pinned_node_ids = Array.from(state.pinned_node_ids);

  return {
    nodes,
    edges,
    pinned_node_ids,
  };
}

export { GET_GRAPH_TOPOLOGY_NAME };
