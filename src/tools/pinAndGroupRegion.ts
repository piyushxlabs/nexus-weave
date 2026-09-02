/**
 * Node 5: pin_and_group_region WebMCP Tool Handler.
 * Sets or unsets pinned status for an explicit list of node IDs.
 * Enforces all-or-nothing validation against graph_nodes.
 * AGENT_MASTER_PLAN.md Section 5 / Step 13, AGENT_LOGIC_SPEC.md Section 4.
 */

import type { GraphAgentState, NodeRecord } from '../state/schema.js';
import { reduceGraphNodes, reducePinnedNodeIds } from '../state/reducers.js';
import { activityBus } from '../ui/activityBus.js';
import { UnknownNodeError } from './dispatch.js';
import {
  PIN_AND_GROUP_REGION_NAME,
  type PinAndGroupRegionResult,
} from './schemas/pinAndGroupRegion.schema.js';

export interface PinAndGroupRegionHandlerContext {
  state: GraphAgentState;
  setState?: (nextState: GraphAgentState) => void;
  signal?: AbortSignal;
  tool_call_id?: string;
}

/**
 * WebMCP handler for pin_and_group_region.
 * All-or-nothing validation: fails completely if any node ID is unknown.
 * Updates pinned_node_ids and graph_nodes[*].pinned via pure reducers.
 * Guarantees node coordinates (x, y) remain 100% untouched.
 */
export async function handlePinAndGroupRegion(
  args: Record<string, unknown>,
  context: PinAndGroupRegionHandlerContext
): Promise<PinAndGroupRegionResult> {
  const { state, setState } = context;
  const nodeIds = args.node_ids as string[];
  const pinned = Boolean(args.pinned);

  // 1. All-or-nothing validation
  for (const id of nodeIds) {
    if (!(id in state.graph_nodes)) {
      throw new UnknownNodeError(
        `Cannot pin/unpin unknown node '${id}'. All-or-nothing check failed.`
      );
    }
  }

  // 2. Compute candidate state updates
  if (setState) {
    const nextPinned = new Set(state.pinned_node_ids);
    for (const id of nodeIds) {
      if (pinned) {
        nextPinned.add(id);
      } else {
        nextPinned.delete(id);
      }
    }

    const nodeUpdates: Record<string, Partial<NodeRecord>> = {};
    for (const id of nodeIds) {
      nodeUpdates[id] = { pinned };
    }

    let nextState = reducePinnedNodeIds(state, nextPinned);
    nextState = reduceGraphNodes(nextState, nodeUpdates);
    setState(nextState);

    // Emit in-page state update events
    activityBus.emit('state-update', {
      field: 'pinned_node_ids',
      reducer: 'last-write-wins',
      changed_ids: nodeIds,
      timestamp: Date.now(),
    });

    activityBus.emit('state-update', {
      field: 'graph_nodes',
      reducer: 'merge-by-key',
      changed_ids: nodeIds,
      timestamp: Date.now(),
    });
  }

  return {
    updated_node_ids: nodeIds,
    pinned,
  };
}

export { PIN_AND_GROUP_REGION_NAME };
