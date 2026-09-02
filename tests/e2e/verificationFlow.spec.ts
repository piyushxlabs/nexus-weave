import { test, expect } from '@playwright/test';

test.describe('Nexus Weave — Step 20 End-to-End Verification Flow', () => {
  test('Complete E2E Flow: Topology → Cycle → Critical Path → Proposal & Confirm → Pin → Refusal', async ({ page }) => {
    // Navigate to local application
    await page.goto('/');
    await page.waitForSelector('#graph-canvas');
    await page.waitForFunction(() => (window as any).__nexusWeave !== undefined);

    // ------------------------------------------------------------------------
    // Step 20.1: Read Graph Topology
    // ------------------------------------------------------------------------
    const topoResult = await page.evaluate(async () => {
      return await (window as any).__nexusWeave.dispatch('get_graph_topology', {});
    });

    expect(topoResult.success).toBe(true);
    expect(topoResult.result.nodes).toHaveLength(16);
    expect(topoResult.result.edges).toHaveLength(23);
    expect(topoResult.result.pinned_node_ids).toHaveLength(0);

    // Verify activity panel records the topology tool execution
    const activityPanel = page.locator('#activity-panel-root');
    await expect(activityPanel).toContainText('get_graph_topology');

    // ------------------------------------------------------------------------
    // Step 20.2: Detect Cycles and Bottlenecks
    // ------------------------------------------------------------------------
    const cycleResult = await page.evaluate(async () => {
      return await (window as any).__nexusWeave.dispatch('detect_cycles_and_bottlenecks', {});
    });

    expect(cycleResult.success).toBe(true);
    expect(cycleResult.result.cyclic_edge_ids.length).toBeGreaterThan(0);
    expect(cycleResult.result.bottleneck_nodes.length).toBeGreaterThan(0);

    // Verify visual highlight: cyclic edges receive dashed stroke and red class
    const cyclicEdges = page.locator('#graph-canvas .edges-layer line.cyclic-edge');
    await expect(cyclicEdges.first()).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 20.3: Compute Critical Path (Silence-Over-Guessing on Cyclic Graph)
    // ------------------------------------------------------------------------
    const criticalPathResult = await page.evaluate(async () => {
      return await (window as any).__nexusWeave.dispatch('compute_critical_path', {
        duration_field: 'duration',
      });
    });

    // Seed graph contains circular cycles, so critical path must explicitly refuse
    expect(criticalPathResult.success).toBe(false);
    expect(criticalPathResult.error).toContain('Graph contains circular dependencies in the evaluated subgraph');

    // ------------------------------------------------------------------------
    // Step 20.4: Propose and Confirm Full-Graph Layout Change (Approval Gate)
    // ------------------------------------------------------------------------
    const allNodeIds = await page.evaluate(() => {
      return Object.keys((window as any).__nexusWeave.state().graph_nodes);
    });

    // Record pre-layout positions of all nodes
    const initialPositions = await page.evaluate(() => {
      const nodes = (window as any).__nexusWeave.state().graph_nodes;
      const pos: Record<string, { x: number; y: number }> = {};
      for (const [id, n] of Object.entries(nodes)) {
        pos[id] = { x: (n as any).x, y: (n as any).y };
      }
      return pos;
    });

    // Dispatch large layout change (> 40% threshold)
    const proposalResult = await page.evaluate(async (region) => {
      return await (window as any).__nexusWeave.dispatch('minimize_edge_crossings', {
        region_node_ids: region,
      });
    }, allNodeIds);

    expect(proposalResult.status).toBe('proposed');

    // Verify Proposal Banner appeared in the DOM
    const proposalBanner = page.locator('#nexus-proposal-banner');
    await expect(proposalBanner).toBeVisible();
    await expect(proposalBanner).toContainText('Proposed Layout Untangling');
    await expect(proposalBanner).toContainText('16 nodes');

    // Verify ghost preview nodes render on the SVG canvas
    const ghostNodes = page.locator('#graph-canvas .ghost-node');
    await expect(ghostNodes).toHaveCount(16);

    // Verify coordinates in state are UNCHANGED until confirmed
    const unconfirmedPositions = await page.evaluate(() => {
      const nodes = (window as any).__nexusWeave.state().graph_nodes;
      const pos: Record<string, { x: number; y: number }> = {};
      for (const [id, n] of Object.entries(nodes)) {
        pos[id] = { x: (n as any).x, y: (n as any).y };
      }
      return pos;
    });
    expect(unconfirmedPositions).toEqual(initialPositions);

    // Candidate positions are held on pending_proposal awaiting human review
    const candidatePositions = await page.evaluate(() => {
      return (window as any).__nexusWeave.state().pending_proposal?.candidate_positions;
    });
    expect(candidatePositions).toBeTruthy();

    // Human-in-the-Loop Resumption: Click [Approve & Apply]
    const approveBtn = page.locator('#proposal-approve-btn');
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Verify proposal banner and ghost overlays disappear
    await expect(proposalBanner).not.toBeVisible();
    await expect(ghostNodes).toHaveCount(0);

    // Verify layout was atomically committed: state positions now match candidate_positions
    const confirmedPositions = await page.evaluate(() => {
      const nodes = (window as any).__nexusWeave.state().graph_nodes;
      const pos: Record<string, { x: number; y: number }> = {};
      for (const [id, n] of Object.entries(nodes)) {
        pos[id] = { x: (n as any).x, y: (n as any).y };
      }
      return pos;
    });

    for (const id of allNodeIds) {
      if (candidatePositions[id]) {
        expect(confirmedPositions[id]).toEqual(candidatePositions[id]);
      }
    }

    // ------------------------------------------------------------------------
    // Step 20.5: Pin a Node
    // ------------------------------------------------------------------------
    const pinResult = await page.evaluate(async () => {
      return await (window as any).__nexusWeave.dispatch('pin_and_group_region', {
        node_ids: ['order-service'],
        pinned: true,
      });
    });

    expect(pinResult.success).toBe(true);

    // Verify visual pin badge and node state on canvas
    const orderNode = page.locator('#node-order-service');
    await expect(orderNode).toHaveClass(/pinned/);

    // ------------------------------------------------------------------------
    // Step 20.6: Attempt (and See Rejected) a Mutation on that Pinned Node
    // ------------------------------------------------------------------------
    const pinnedBeforeX = await page.evaluate(() => {
      return (window as any).__nexusWeave.state().graph_nodes['order-service'].x;
    });

    const mutationAttemptResult = await page.evaluate(async () => {
      return await (window as any).__nexusWeave.dispatch('minimize_edge_crossings', {
        region_node_ids: ['order-service'],
      });
    });

    // Guardrail verification: must fail explicitly with pinned conflict error
    expect(mutationAttemptResult.success).toBe(false);
    expect(mutationAttemptResult.error).toContain('all specified nodes are pinned');

    // Structural immutability: coordinates must remain 100% unchanged
    const pinnedAfterX = await page.evaluate(() => {
      return (window as any).__nexusWeave.state().graph_nodes['order-service'].x;
    });
    expect(pinnedAfterX).toBe(pinnedBeforeX);

    // Verify telemetry logs reflect all operations
    await expect(activityPanel).toContainText('minimize_edge_crossings');
  });
});
