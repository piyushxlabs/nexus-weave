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
    },
    onDiscard: () => {
      canvas.clearProposal();
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
