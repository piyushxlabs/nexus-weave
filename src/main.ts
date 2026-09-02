/**
 * Main Application Mounting Harness for Nexus Weave.
 * Initializes state from seedGraph, mounts SVG canvas, activity panel, and banners,
 * and sets up WebMCP tool registration and lifecycle.
 * INTERFACE_OBSERVABILITY_SYSTEM.md / AGENT_MASTER_PLAN.md Step 17.
 */

import { createInitialState, type GraphAgentState } from './state/schema.js';
import { createSeedGraph } from './state/seedGraph.js';
import { initDefaultHandlers, dispatchToolCall } from './tools/dispatch.js';
import { isWebMCPSupported, setupWebMCPLifecycle } from './webmcp/register.js';
import { GraphCanvas } from './ui/canvas.js';
import { ActivityPanel } from './ui/activityPanel.js';
import { renderUnsupportedBanner } from './ui/unsupportedBanner.js';
import { setupProposalBannerListener } from './ui/proposalBanner.js';
import { activityBus } from './ui/activityBus.js';


export interface NexusWeaveApp {
  state: () => GraphAgentState;
  canvas: GraphCanvas;
  activityPanel: ActivityPanel;
  dispatch: (toolName: string, args?: Record<string, unknown>) => Promise<any>;
  unmount: () => void;
}

/**
 * Bootstraps and mounts the Nexus Weave application into the DOM.
 */
export function bootstrapNexusWeave(): NexusWeaveApp | null {
  // Ensure default tool handlers are registered
  initDefaultHandlers();

  // Initialize in-memory state with seed microservices graph
  const seed = createSeedGraph();
  let state = createInitialState();
  state.graph_nodes = seed.nodes;
  state.graph_edges = seed.edges;

  const stateAccessor = {
    getState: () => state,
    setState: (next: GraphAgentState) => {
      state = next;
    },
  };

  // Find DOM container mount points
  const bannerRoot = document.getElementById('banner-root');
  const canvasElement = document.getElementById('graph-canvas') as unknown as SVGSVGElement | null;
  const activityPanelRoot = document.getElementById('activity-panel-root');

  if (!canvasElement || !bannerRoot || !activityPanelRoot) {
    console.warn('Nexus Weave mount containers not found in DOM.');
    return null;
  }

  // 1. Mount WebMCP Unsupported Cold-Judge Banner if WebMCP is absent
  const webmcpAvailable = isWebMCPSupported();
  if (!webmcpAvailable) {
    renderUnsupportedBanner(bannerRoot);
  }

  // 2. Mount Reactive SVG Graph Canvas
  const canvas = new GraphCanvas({
    svgElement: canvasElement,
    getState: stateAccessor.getState,
    setState: stateAccessor.setState,
  });

  // Update header HUD with initial seed graph stats
  const initNodes = Object.keys(state.graph_nodes).length;
  const initEdges = Object.keys(state.graph_edges).length;
  const nodesLabel = document.getElementById('hud-nodes-label');
  const edgesLabel = document.getElementById('hud-edges-label');
  const cyclesLabel = document.getElementById('hud-cycles-label');
  if (nodesLabel) nodesLabel.textContent = `Nodes: ${initNodes}`;
  if (edgesLabel) edgesLabel.textContent = `Dependencies: ${initEdges}`;
  if (cyclesLabel) cyclesLabel.textContent = 'Cycles: Scan \u25b6';
  const layoutLabelEl = document.getElementById('hud-layout-label');
  if (layoutLabelEl) layoutLabelEl.textContent = 'Layout: Untangle \u25b6';

  // Update WebMCP status indicator in header
  const webmcpText = document.getElementById('webmcp-status-text');
  const webmcpDot = document.querySelector('.webmcp-status-dot') as HTMLElement | null;
  if (webmcpText) webmcpText.textContent = webmcpAvailable ? 'WebMCP Active' : 'Simulation Mode';
  if (webmcpDot) webmcpDot.style.background = webmcpAvailable ? '#10B981' : '#F59E0B';

  // 2b. Wire interactive HUD badge buttons for browser agent auto-browse
  // Each badge is guarded by an in-flight flag to prevent concurrent dispatches.
  let cyclesBadgeBusy = false;
  let layoutBadgeBusy = false;

  const badgeCyclesEl = document.getElementById('badge-cycles');
  const badgeLayoutEl = document.getElementById('badge-layout');

  const handleCyclesBadgeClick = async () => {
    if (cyclesBadgeBusy) return;
    cyclesBadgeBusy = true;
    canvas.setHUDBadgeBusy('badge-cycles', 'Scanning…');
    try {
      await dispatchToolCall('detect_cycles_and_bottlenecks', {}, stateAccessor);
    } finally {
      cyclesBadgeBusy = false;
      canvas.clearHUDBadgeBusy('badge-cycles');
    }
  };

  const handleLayoutBadgeClick = async () => {
    if (layoutBadgeBusy) return;
    layoutBadgeBusy = true;
    canvas.setHUDBadgeBusy('badge-layout', 'Requesting…');
    try {
      const allNodeIds = Object.keys(stateAccessor.getState().graph_nodes);
      await dispatchToolCall(
        'minimize_edge_crossings',
        { region_node_ids: allNodeIds },
        stateAccessor
      );
    } finally {
      layoutBadgeBusy = false;
      canvas.clearHUDBadgeBusy('badge-layout');
    }
  };

  if (badgeCyclesEl) {
    badgeCyclesEl.addEventListener('click', handleCyclesBadgeClick);
    badgeCyclesEl.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        void handleCyclesBadgeClick();
      }
    });
  }

  if (badgeLayoutEl) {
    badgeLayoutEl.addEventListener('click', handleLayoutBadgeClick);
    badgeLayoutEl.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        void handleLayoutBadgeClick();
      }
    });
  }

  // 2c. Wire Chaos Engineering button — pure UI simulation, zero GraphAgentState mutation
  const chaosBtn = document.getElementById('chaos-btn') as HTMLButtonElement | null;
  // Hardcoded to the seed graph's Payment Gateway and its known downstream dependents
  const CHAOS_ORIGIN = 'payment-service';
  const CHAOS_DOWNSTREAM = ['notification-service', 'order-service'];
  let chaosActive = false;

  if (chaosBtn) {
    chaosBtn.addEventListener('click', () => {
      if (!chaosActive) {
        // Activate: apply visual cascade and emit telemetry log entry
        chaosActive = true;
        chaosBtn.setAttribute('aria-pressed', 'true');
        chaosBtn.textContent = '\u26a1 Clear Chaos Simulation';

        canvas.applyChaosMode(CHAOS_ORIGIN, CHAOS_DOWNSTREAM);

        // Emit structured chaos event to in-page activity bus (telemetry log)
        activityBus.emit('tool-invocation-result', {
          tool_call_id: `chaos-${Date.now()}`,
          tool_name: 'chaos_inject',
          success: true,
          status: 'applied',
          result: {
            message:
              '[CHAOS_INJECTED] Payment Gateway failure cascaded across 3 downstream services',
            origin: CHAOS_ORIGIN,
            affected: CHAOS_DOWNSTREAM,
            simulated_latency_ms: 9999,
            simulated_error_rate: 1.0,
          },
          timestamp: Date.now(),
        });
      } else {
        // Deactivate: restore canvas
        chaosActive = false;
        chaosBtn.setAttribute('aria-pressed', 'false');
        chaosBtn.textContent = '\u26a1 Inject Chaos: Payment Outage';
        canvas.clearChaosMode();
      }
    });
  }

  // 2d. Wire Floating Viewport Navigation Controls (Zoom In/Out, Reset)
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => canvas.zoomIn(0.15));
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => canvas.zoomOut(0.15));
  }
  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => canvas.resetViewport());
  }

  // 3. Mount In-Page Activity & Telemetry Panel
  const activityPanel = new ActivityPanel(activityPanelRoot);


  // 4. Setup Proposal Banner Listener for Human-in-the-Loop Resumption
  const unbindProposalListener = setupProposalBannerListener(bannerRoot, {
    onApprove: async (proposal) => {
      await dispatchToolCall(
        'minimize_edge_crossings',
        {
          region_node_ids: proposal.region_node_ids,
          confirm_pending: true,
        },
        stateAccessor
      );
      canvas.clearProposal();
      canvas.clearHUDBadgeBusy('badge-layout');
    },
    onDiscard: () => {
      canvas.clearProposal();
      canvas.clearHUDBadgeBusy('badge-layout');
    },
  });

  // 5. Setup WebMCP Lifecycle & Registration if available
  let unbindWebMCP: (() => void) | null = null;
  if (webmcpAvailable) {
    try {
      const lifecycle = setupWebMCPLifecycle(stateAccessor);
      unbindWebMCP = () => lifecycle.controller.abort();
    } catch (err) {
      console.error('Failed to register WebMCP tools:', err);
    }
  }

  const unmount = () => {
    canvas.destroy();
    activityPanel.destroy();
    unbindProposalListener();
    if (unbindWebMCP) unbindWebMCP();
  };

  const app: NexusWeaveApp = {
    state: stateAccessor.getState,
    canvas,
    activityPanel,
    dispatch: (toolName: string, args: Record<string, unknown> = {}) => dispatchToolCall(toolName, args, stateAccessor),
    unmount,
  };

  if (typeof window !== 'undefined') {
    (window as any).__nexusWeave = app;
  }

  return app;
}

// Auto-bootstrap in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootstrapNexusWeave();
    });
  } else {
    bootstrapNexusWeave();
  }
}
