import { describe, it, expect, beforeEach } from 'vitest';
import {
  activityBus,
  type ToolInvocationStartDetail,
  type ToolInvocationStatusDetail,
  type ToolInvocationResultDetail,
  type StateUpdateDetail,
  type ApprovalRequiredDetail,
  type ToolInvocationErrorDetail,
} from '../../src/ui/activityBus.js';
import { dispatchToolCall, initDefaultHandlers } from '../../src/tools/dispatch.js';
import { createInitialState, type GraphAgentState } from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

describe('Step 15: In-Page Activity Event Bus', () => {
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

  it('allows subscribing and unsubscribing cleanly with no residual emissions', () => {
    let callCount = 0;
    const unsubscribe = activityBus.subscribe('tool-invocation-start', () => {
      callCount++;
    });

    activityBus.emit('tool-invocation-start', {
      tool_call_id: 'call_test',
      tool_name: 'test_tool',
      args: {},
      timestamp: Date.now(),
    });

    expect(callCount).toBe(1);

    unsubscribe();

    activityBus.emit('tool-invocation-start', {
      tool_call_id: 'call_test_2',
      tool_name: 'test_tool',
      args: {},
      timestamp: Date.now(),
    });

    // Count must remain 1 after unsubscription
    expect(callCount).toBe(1);
  });

  it('Event 1: fires tool-invocation-start before validation with exact payload shape', async () => {
    let captured: ToolInvocationStartDetail | null = null;
    const unsubscribe = activityBus.subscribe('tool-invocation-start', (e) => {
      captured = e.detail;
    });

    await dispatchToolCall('get_graph_topology', {}, stateAccessor);
    unsubscribe();

    expect(captured).not.toBeNull();
    expect(captured!.tool_call_id).toMatch(/^call_\d+_\d+$/);
    expect(captured!.tool_name).toBe('get_graph_topology');
    expect(captured!.args).toEqual({});
    expect(typeof captured!.timestamp).toBe('number');
  });

  it('Event 2: fires tool-invocation-status (in_progress) during direct execution', async () => {
    const statuses: ToolInvocationStatusDetail[] = [];
    const unsubscribe = activityBus.subscribe('tool-invocation-status', (e) => {
      statuses.push(e.detail);
    });

    await dispatchToolCall('get_graph_topology', {}, stateAccessor);
    unsubscribe();

    expect(statuses.length).toBeGreaterThanOrEqual(1);
    const inProgress = statuses.find((s) => s.status === 'in_progress');
    expect(inProgress).toBeDefined();
    expect(inProgress!.tool_call_id).toMatch(/^call_\d+_\d+$/);
    expect(typeof inProgress!.timestamp).toBe('number');
  });

  it('Event 3: fires tool-invocation-result with success, status, and result payload', async () => {
    let captured: ToolInvocationResultDetail | null = null;
    const unsubscribe = activityBus.subscribe('tool-invocation-result', (e) => {
      captured = e.detail;
    });

    await dispatchToolCall('get_graph_topology', {}, stateAccessor);
    unsubscribe();

    expect(captured).not.toBeNull();
    expect(captured!.success).toBe(true);
    expect(captured!.tool_name).toBe('get_graph_topology');
    expect(captured!.result).toBeDefined();
    expect(typeof captured!.timestamp).toBe('number');
  });

  it('Event 4: fires state-update when state reducers commit mutations', async () => {
    const updates: StateUpdateDetail[] = [];
    const unsubscribe = activityBus.subscribe('state-update', (e) => {
      updates.push(e.detail);
    });

    // detect_cycles_and_bottlenecks mutates graph_edges
    await dispatchToolCall('detect_cycles_and_bottlenecks', {}, stateAccessor);
    unsubscribe();

    expect(updates.length).toBeGreaterThanOrEqual(1);
    const edgeUpdate = updates.find((u) => u.field === 'graph_edges');
    expect(edgeUpdate).toBeDefined();
    expect(edgeUpdate!.reducer).toBe('merge-by-key');
    expect(Array.isArray(edgeUpdate!.changed_ids)).toBe(true);
    expect(typeof edgeUpdate!.timestamp).toBe('number');
  });

  it('Event 5: fires approval-required and tool-invocation-status (proposed) on large mutation', async () => {
    let approvalCaptured: ApprovalRequiredDetail | null = null;
    let proposedStatusCaptured: ToolInvocationStatusDetail | null = null;

    const unsubApproval = activityBus.subscribe('approval-required', (e) => {
      approvalCaptured = e.detail;
    });
    const unsubStatus = activityBus.subscribe('tool-invocation-status', (e) => {
      if (e.detail.status === 'proposed') {
        proposedStatusCaptured = e.detail;
      }
    });

    const allNodeIds = Object.keys(state.graph_nodes);
    await dispatchToolCall(
      'minimize_edge_crossings',
      { region_node_ids: allNodeIds },
      stateAccessor
    );

    unsubApproval();
    unsubStatus();

    expect(approvalCaptured).not.toBeNull();
    expect(approvalCaptured!.region_node_ids).toEqual(allNodeIds);
    expect(approvalCaptured!.preview).toBeDefined();
    expect(typeof approvalCaptured!.timestamp).toBe('number');

    expect(proposedStatusCaptured).not.toBeNull();
    expect(proposedStatusCaptured!.status).toBe('proposed');
  });

  it('Event 6: fires tool-invocation-error on schema or invariant failure', async () => {
    let errorCaptured: ToolInvocationErrorDetail | null = null;
    const unsubscribe = activityBus.subscribe('tool-invocation-error', (e) => {
      errorCaptured = e.detail;
    });

    // Pass invalid arguments to trigger ajv validation failure
    await dispatchToolCall(
      'compute_critical_path',
      { duration_field: 12345 } as any,
      stateAccessor
    );

    unsubscribe();

    expect(errorCaptured).not.toBeNull();
    expect(errorCaptured!.success).toBe(false);
    expect(errorCaptured!.tool_name).toBe('compute_critical_path');
    expect(errorCaptured!.error).toBeDefined();
    expect(typeof errorCaptured!.timestamp).toBe('number');
  });
});
