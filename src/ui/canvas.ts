/**
 * Reactive SVG Graph Canvas Component — Enterprise Redesign.
 * High-performance, accessible SVG graph rendering with 60 FPS CSS transitions,
 * deep cyber-observability aesthetic, glassmorphism node cards, neon cyclic edges,
 * ghost-preview overlay, and direct-manipulation dragging.
 * INTERFACE_OBSERVABILITY_SYSTEM.md Sections 2, 4a, and 5.
 */

import type { GraphAgentState, NodeRecord, EdgeRecord, ProposedMutation } from '../state/schema.js';
import { reduceGraphNodes, reducePinnedNodeIds } from '../state/reducers.js';
import { createPinBadgeElement } from './pinBadges.js';
import { activityBus } from './activityBus.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface CanvasOptions {
  svgElement: SVGSVGElement;
  getState: () => GraphAgentState;
  setState: (next: GraphAgentState) => void;
  width?: number;
  height?: number;
}

export class GraphCanvas {
  private svg: SVGSVGElement;
  private getState: () => GraphAgentState;
  private setState: (next: GraphAgentState) => void;
  private width: number;
  private height: number;

  private edgesGroup!: SVGGElement;
  private ghostGroup!: SVGGElement;
  private nodesGroup!: SVGGElement;
  private statusPillGroup!: SVGGElement;
  private backgroundGroup!: SVGGElement;

  private activeProposal: ProposedMutation | null = null;
  private statusText: string | null = null;

  private unsubscribeFns: Array<() => void> = [];
  private draggingNodeId: string | null = null;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  // Viewport navigation state (pan & zoom)
  private viewX: number = 0;
  private viewY: number = 0;
  private viewWidth: number;
  private viewHeight: number;
  private scale: number = 1.15;
  private isPanning: boolean = false;
  private panStart: { x: number; y: number } = { x: 0, y: 0 };
  private panViewStart: { x: number; y: number } = { x: 0, y: 0 };

  constructor(options: CanvasOptions) {
    this.svg = options.svgElement;
    this.getState = options.getState;
    this.setState = options.setState;
    this.width = options.width || 1200;
    this.height = options.height || 800;
    this.viewWidth = this.width / this.scale;
    this.viewHeight = this.height / this.scale;

    this.initCanvasStructure();
    this.setupBusListeners();
    this.autoCenter(this.getState().graph_nodes, 1.15);
    this.render();
  }

  public destroy(): void {
    for (const unsub of this.unsubscribeFns) {
      unsub();
    }
    this.unsubscribeFns = [];
    this.svg.innerHTML = '';
  }

  private initCanvasStructure(): void {
    this.svg.setAttribute('viewBox', `${this.viewX} ${this.viewY} ${this.viewWidth} ${this.viewHeight}`);
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.style.backgroundColor = 'transparent';
    this.svg.style.userSelect = 'none';
    this.svg.style.cursor = 'grab';

    // ── SVG Defs: Filters, Patterns, Markers ──────────────────────────
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <!-- ── Dot-matrix background pattern ── -->
      <pattern id="bg-dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="rgba(148,163,184,0.12)" />
      </pattern>

      <!-- ── Glow filters ── -->
      <filter id="filter-neon-rose" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <filter id="filter-neon-amber" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <filter id="filter-node-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.5)" flood-opacity="1" />
      </filter>

      <filter id="filter-pinned-glow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="rgba(6,182,212,0.5)" flood-opacity="1" />
      </filter>

      <filter id="filter-cyclic-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>

      <!-- ── Standard edge marker ── -->
      <marker id="arrow-standard" viewBox="0 -4 8 8" refX="26" refY="0" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0,-4L8,0L0,4" fill="rgba(148,163,184,0.5)" />
      </marker>

      <!-- ── Cyclic warning edge marker (rose) ── -->
      <marker id="arrow-cyclic" viewBox="0 -4 8 8" refX="26" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-4L8,0L0,4" fill="#F43F5E" />
      </marker>

      <!-- ── Critical path edge marker (amber) ── -->
      <marker id="arrow-critical" viewBox="0 -4 8 8" refX="26" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-4L8,0L0,4" fill="#F59E0B" />
      </marker>

      <!-- ── Ghost preview marker ── -->
      <marker id="arrow-ghost" viewBox="0 -4 8 8" refX="26" refY="0" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0,-4L8,0L0,4" fill="#818CF8" />
      </marker>

      <!-- ── Gradient for pinned node border ── -->
      <linearGradient id="grad-pinned-border" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#3B82F6" stop-opacity="0.7" />
      </linearGradient>

      <!-- ── Gradient for healthy node card ── -->
      <linearGradient id="grad-node-card" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="100%" stop-color="#0D1526" />
      </linearGradient>

      <!-- ── Gradient for cyclic node card ── -->
      <linearGradient id="grad-node-cyclic" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1A0E12" />
        <stop offset="100%" stop-color="#0F0A0D" />
      </linearGradient>

      <!-- ── CSS Animation injected as SVG style ── -->
      <style>
        @keyframes svg-led-pulse {
          0%, 100% { opacity: 1; r: 3.5px; }
          50% { opacity: 0.5; r: 2.5px; }
        }
        @keyframes svg-dash-march {
          to { stroke-dashoffset: -20; }
        }
        .cyclic-edge {
          animation: svg-dash-march 1.2s linear infinite;
        }
        .led-healthy { animation: svg-led-pulse 2.5s ease-in-out infinite; }
        .led-warning { animation: svg-led-pulse 1.8s ease-in-out infinite; }
        .led-critical { animation: svg-led-pulse 1s ease-in-out infinite; }
        .graph-node { cursor: grab; }
        .graph-node:active { cursor: grabbing; }
        /* Smooth coordinate glide on Approve & Apply */
        .graph-node { transition: transform 450ms cubic-bezier(0.16, 1, 0.3, 1); }
        /* Edge stroke transition */
        .graph-edge-line { transition: stroke 300ms ease, stroke-opacity 300ms ease; }
        /* Chaos mode: cascading failure pulse on node card */
        @keyframes chaos-node-pulse {
          0%   { filter: drop-shadow(0 0 0px rgba(239,68,68,0)); }
          40%  { filter: drop-shadow(0 0 10px rgba(239,68,68,0.8)); }
          100% { filter: drop-shadow(0 0 4px  rgba(239,68,68,0.4)); }
        }
        .chaos-node {
          animation: chaos-node-pulse 0.8s ease-out forwards;
        }
        .chaos-node-active {
          animation: chaos-node-pulse 1.4s ease-in-out infinite;
        }
        /* Chaos cascade edge: deep crimson march */
        .chaos-edge {
          stroke: #EF4444 !important;
          stroke-opacity: 0.85 !important;
          animation: svg-dash-march 0.7s linear infinite;
        }
      </style>
    `;
    this.svg.appendChild(defs);

    // ── Background dot-matrix layer ──────────────────────────────────
    this.backgroundGroup = document.createElementNS(SVG_NS, 'g');
    this.backgroundGroup.setAttribute('class', 'background-layer');
    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', '-50000');
    bgRect.setAttribute('y', '-50000');
    bgRect.setAttribute('width', '100000');
    bgRect.setAttribute('height', '100000');
    bgRect.setAttribute('fill', 'url(#bg-dot-grid)');
    this.backgroundGroup.appendChild(bgRect);
    this.svg.appendChild(this.backgroundGroup);

    // ── Rendering layers ─────────────────────────────────────────────
    this.edgesGroup = document.createElementNS(SVG_NS, 'g');
    this.edgesGroup.setAttribute('class', 'edges-layer');
    this.svg.appendChild(this.edgesGroup);

    this.ghostGroup = document.createElementNS(SVG_NS, 'g');
    this.ghostGroup.setAttribute('class', 'ghost-layer');
    this.svg.appendChild(this.ghostGroup);

    this.nodesGroup = document.createElementNS(SVG_NS, 'g');
    this.nodesGroup.setAttribute('class', 'nodes-layer');
    this.svg.appendChild(this.nodesGroup);

    this.statusPillGroup = document.createElementNS(SVG_NS, 'g');
    this.statusPillGroup.setAttribute('class', 'status-pill-layer');
    this.svg.appendChild(this.statusPillGroup);

    // Global SVG drag and wheel navigation events
    this.svg.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this.handleDragMove(e));
    this.svg.addEventListener('mouseup', () => this.handleDragEnd());
    this.svg.addEventListener('mouseleave', () => this.handleDragEnd());
    this.svg.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
  }

  private setupBusListeners(): void {
    // 1. Tool start — show status pill
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-start', (e) => {
        const { tool_name } = e.detail;
        const labels: Record<string, string> = {
          get_graph_topology:          'Reading graph topology…',
          detect_cycles_and_bottlenecks: 'Checking for cycles…',
          compute_critical_path:       'Computing critical path…',
          minimize_edge_crossings:     'Untangling region…',
          pin_and_group_region:        'Updating pins…',
        };
        this.statusText = labels[tool_name] || 'Processing…';
        this.renderStatusPill();
      })
    );

    // 2. State update — re-render
    this.unsubscribeFns.push(
      activityBus.subscribe('state-update', () => {
        this.render();
        this.updateHUD();
      })
    );

    // 3. Approval required — ghost-preview overlay
    this.unsubscribeFns.push(
      activityBus.subscribe('approval-required', (e) => {
        const detail = e.detail;
        this.activeProposal = {
          tool_call_id: detail.tool_call_id,
          tool_name: 'minimize_edge_crossings',
          region_node_ids: detail.region_node_ids,
          candidate_positions: (detail.preview?.candidate_positions as Record<string, { x: number; y: number }>) || {},
          candidate_crossings: (detail.preview?.candidate_crossings as number) ?? 0,
          initial_crossings: (detail.preview?.initial_crossings as number) ?? 0,
          status: 'proposed',
        };
        this.renderGhostOverlay();
      })
    );

    // 4. Tool result / error — clear status pill
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-result', () => {
        this.statusText = null;
        this.renderStatusPill();
      })
    );
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-error', () => {
        this.statusText = null;
        this.renderStatusPill();
      })
    );
  }

  public clearProposal(): void {
    this.activeProposal = null;
    this.ghostGroup.innerHTML = '';
  }

  public render(): void {
    const state = this.getState();
    const nodes = state.graph_nodes;
    const edges = state.graph_edges;
    const pinnedIds = state.pinned_node_ids;

    this.renderEdges(edges, nodes);
    this.renderNodes(nodes, pinnedIds);
    this.renderGhostOverlay();
    this.renderStatusPill();
  }

  /** Update the header HUD stats from current state */
  private updateHUD(): void {
    const state = this.getState();
    const nodes = Object.keys(state.graph_nodes);
    const edges = Object.values(state.graph_edges);
    const cyclicCount = edges.filter((e) => e.is_cyclic).length;

    const nodesLabel = document.getElementById('hud-nodes-label');
    const edgesLabel = document.getElementById('hud-edges-label');
    const cyclesLabel = document.getElementById('hud-cycles-label');
    const layoutLabel = document.getElementById('hud-layout-label');
    const badgeCycles = document.getElementById('badge-cycles');
    const badgeLayout = document.getElementById('badge-layout');

    if (nodesLabel) nodesLabel.textContent = `Nodes: ${nodes.length}`;
    if (edgesLabel) edgesLabel.textContent = `Dependencies: ${edges.length}`;

    if (cyclesLabel && badgeCycles && badgeCycles.getAttribute('aria-disabled') !== 'true') {
      if (cyclicCount > 0) {
        cyclesLabel.textContent = `Cycles: ${cyclicCount} Loop${cyclicCount > 1 ? 's' : ''}`;
        badgeCycles.classList.add('danger');
        badgeCycles.classList.remove('safe');
      } else if (edges.some((e) => e.is_cyclic !== undefined)) {
        // Scan was run and found no cycles
        cyclesLabel.textContent = 'Cycles: None';
      } else {
        // Never scanned
        cyclesLabel.textContent = 'Cycles: Scan ▶';
      }
    }

    if (layoutLabel && badgeLayout && badgeLayout.getAttribute('aria-disabled') !== 'true') {
      const crossings = this.activeProposal?.initial_crossings;
      if (crossings !== undefined && crossings > 0) {
        layoutLabel.textContent = `Tangled: ${crossings} crossings`;
      } else if (this.activeProposal) {
        layoutLabel.textContent = 'Layout: Pending Approval';
      } else {
        layoutLabel.textContent = 'Layout: Untangle ▶';
      }
    }

    // Pinned count pill
    const pinnedLabel = document.getElementById('hud-pinned-label');
    if (pinnedLabel) {
      const pinnedCount = state.pinned_node_ids.size;
      pinnedLabel.textContent = `Pinned: ${pinnedCount}`;
    }

    // Update WebMCP status text
    const webmcpText = document.getElementById('webmcp-status-text');
    if (webmcpText) {
      const supported = state.config.webmcp_supported;
      webmcpText.textContent = supported ? 'WebMCP Active' : 'Simulation Mode';
      const dot = document.querySelector('.webmcp-status-dot') as HTMLElement | null;
      if (dot) {
        dot.style.background = supported ? '#10B981' : '#F59E0B';
      }
    }
  }

  /** Visually lock a HUD badge to show it is in-flight */
  public setHUDBadgeBusy(badgeId: string, label: string): void {
    const badge = document.getElementById(badgeId);
    const labelEl = badge?.querySelector('span:last-child') as HTMLElement | null;
    if (badge) badge.setAttribute('aria-disabled', 'true');
    if (labelEl) labelEl.textContent = label;
  }

  /** Restore a HUD badge to interactive state */
  public clearHUDBadgeBusy(badgeId: string): void {
    const badge = document.getElementById(badgeId);
    if (badge) badge.removeAttribute('aria-disabled');
  }

  /**
   * Apply chaos-mode visual pulse to a set of node IDs (pure presentation — no GraphAgentState mutation).
   * The origin node gets a sustained chaos-node-active pulse; downstream nodes get a one-shot cascade.
   * Downstream edge lines are marked with chaos-edge class for the crimson march animation.
   * @param originId - The node ID of the failing service (e.g. 'payment-service')
   * @param downstreamIds - Array of impacted downstream node IDs
   */
  public applyChaosMode(originId: string, downstreamIds: string[]): void {
    // Mark origin node
    const originEl = this.svg.querySelector(`#node-${CSS.escape(originId)}`);
    if (originEl) {
      originEl.classList.remove('chaos-node');
      // Force reflow to restart animation
      void (originEl as SVGElement).getBoundingClientRect();
      originEl.classList.add('chaos-node-active');
    }

    // Stagger downstream cascade
    downstreamIds.forEach((nodeId, i) => {
      const nodeEl = this.svg.querySelector(`#node-${CSS.escape(nodeId)}`);
      if (nodeEl) {
        setTimeout(() => {
          nodeEl.classList.remove('chaos-node-active');
          nodeEl.classList.add('chaos-node');
        }, (i + 1) * 220);
      }
    });

    // Mark downstream edges with chaos styling
    this.edgesGroup.querySelectorAll('line').forEach((line) => {
      const edgeId = line.getAttribute('data-edge-id') ?? '';
      const state = this.getState();
      const edge = state.graph_edges[edgeId];
      if (!edge) return;
      const involvedInChaos =
        edge.source_id === originId ||
        downstreamIds.includes(edge.source_id) ||
        downstreamIds.includes(edge.target_id);
      if (involvedInChaos) {
        line.classList.add('chaos-edge');
      }
    });
  }

  /** Remove all chaos-mode visual classes from the canvas */
  public clearChaosMode(): void {
    this.svg.querySelectorAll('.chaos-node-active, .chaos-node').forEach((el) => {
      el.classList.remove('chaos-node-active', 'chaos-node');
    });
    this.edgesGroup.querySelectorAll('.chaos-edge').forEach((el) => {
      el.classList.remove('chaos-edge');
    });
  }



  // ── Node Classification ────────────────────────────────────────────
  private getNodeStatus(
    nodeId: string,
    edges: Record<string, EdgeRecord>
  ): 'cyclic' | 'bottleneck' | 'healthy' {
    const isCyclic = Object.values(edges).some(
      (e) => e.is_cyclic && (e.source_id === nodeId || e.target_id === nodeId)
    );
    if (isCyclic) return 'cyclic';

    // High out-degree = bottleneck heuristic
    const outDegree = Object.values(edges).filter((e) => e.source_id === nodeId).length;
    if (outDegree >= 3) return 'bottleneck';

    return 'healthy';
  }

  // ── Edge Rendering ────────────────────────────────────────────────
  private renderEdges(
    edges: Record<string, EdgeRecord>,
    nodes: Record<string, NodeRecord>
  ): void {
    this.edgesGroup.innerHTML = '';

    for (const [id, edge] of Object.entries(edges)) {
      const source = nodes[edge.source_id];
      const target = nodes[edge.target_id];
      if (!source || !target) continue;

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('id', `edge-${id}`);
      line.setAttribute('data-edge-id', id);
      line.setAttribute('x1', String(source.x));
      line.setAttribute('y1', String(source.y));
      line.setAttribute('x2', String(target.x));
      line.setAttribute('y2', String(target.y));

      // 60 FPS smooth transitions
      line.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';


      if (edge.is_cyclic) {
        // High-voltage crimson/rose neon — animated dashed stroke
        line.setAttribute('class', 'cyclic-edge');
        line.setAttribute('stroke', '#F43F5E');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6,4');
        line.setAttribute('stroke-opacity', '0.85');
        line.setAttribute('filter', 'url(#filter-cyclic-glow)');
        line.setAttribute('marker-end', 'url(#arrow-cyclic)');
      } else if (edge.is_critical) {
        // Vibrant electric amber — glowing critical path
        line.setAttribute('class', 'critical-edge');
        line.setAttribute('stroke', '#F59E0B');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-opacity', '0.9');
        line.setAttribute('filter', 'url(#filter-neon-amber)');
        line.setAttribute('marker-end', 'url(#arrow-critical)');
      } else {
        // Standard: sleek semi-transparent slate-cyan
        line.setAttribute('class', 'standard-edge');
        line.setAttribute('stroke', 'rgba(148,163,184,0.35)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('marker-end', 'url(#arrow-standard)');
      }

      this.edgesGroup.appendChild(line);
    }
  }

  // ── Node Rendering ────────────────────────────────────────────────
  private renderNodes(
    nodes: Record<string, NodeRecord>,
    pinnedIds: ReadonlySet<string>
  ): void {
    this.nodesGroup.innerHTML = '';

    const state = this.getState();

    for (const [id, node] of Object.entries(nodes)) {
      const isPinned = pinnedIds.has(id) || node.pinned === true;
      const nodeStatus = this.getNodeStatus(id, state.graph_edges);

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('id', `node-${id}`);
      g.setAttribute('class', `graph-node ${isPinned ? 'pinned' : ''}`);
      g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      g.setAttribute('cursor', 'grab');
      g.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

      // Card width/height (slightly boosted for sharpness & video recording prominence)
      const cardW = 132;
      const cardH = 56;
      const cardX = -(cardW / 2);
      const cardY = -(cardH / 2);

      // ── Outer glow / shadow ──────────────────────────────────────
      if (isPinned) {
        g.setAttribute('filter', 'url(#filter-pinned-glow)');
      }

      // ── Card background rectangle (glassmorphism) ────────────────
      const cardBg = document.createElementNS(SVG_NS, 'rect');
      cardBg.setAttribute('x', String(cardX));
      cardBg.setAttribute('y', String(cardY));
      cardBg.setAttribute('width', String(cardW));
      cardBg.setAttribute('height', String(cardH));
      cardBg.setAttribute('rx', '10');
      cardBg.setAttribute('ry', '10');
      cardBg.setAttribute('fill', isPinned ? '#0E1927' : 'url(#grad-node-card)');
      cardBg.setAttribute('filter', 'url(#filter-node-shadow)');
      g.appendChild(cardBg);

      // ── Outer border (double-layer: subtle) ─────────────────────
      const cardBorder = document.createElementNS(SVG_NS, 'rect');
      cardBorder.setAttribute('x', String(cardX));
      cardBorder.setAttribute('y', String(cardY));
      cardBorder.setAttribute('width', String(cardW));
      cardBorder.setAttribute('height', String(cardH));
      cardBorder.setAttribute('rx', '10');
      cardBorder.setAttribute('ry', '10');
      cardBorder.setAttribute('fill', 'none');
      if (isPinned) {
        cardBorder.setAttribute('stroke', 'url(#grad-pinned-border)');
        cardBorder.setAttribute('stroke-width', '1.5');
      } else if (nodeStatus === 'cyclic') {
        cardBorder.setAttribute('stroke', 'rgba(244,63,94,0.35)');
        cardBorder.setAttribute('stroke-width', '1.5');
      } else {
        cardBorder.setAttribute('stroke', 'rgba(255,255,255,0.08)');
        cardBorder.setAttribute('stroke-width', '1');
      }
      g.appendChild(cardBorder);

      // ── Inner subtle highlight line at top ──────────────────────
      const innerHighlight = document.createElementNS(SVG_NS, 'rect');
      innerHighlight.setAttribute('x', String(cardX + 10));
      innerHighlight.setAttribute('y', String(cardY + 1));
      innerHighlight.setAttribute('width', String(cardW - 20));
      innerHighlight.setAttribute('height', '1');
      innerHighlight.setAttribute('rx', '0.5');
      innerHighlight.setAttribute('fill', 'rgba(255,255,255,0.06)');
      g.appendChild(innerHighlight);

      // ── Status LED dot (top-left) ───────────────────────────────
      const ledX = cardX + 12;
      const ledY = cardY + 15;
      const led = document.createElementNS(SVG_NS, 'circle');
      led.setAttribute('cx', String(ledX));
      led.setAttribute('cy', String(ledY));
      led.setAttribute('r', '3.5');

      if (nodeStatus === 'cyclic') {
        led.setAttribute('fill', '#EF4444');
        led.setAttribute('class', 'led-critical');
      } else if (nodeStatus === 'bottleneck') {
        led.setAttribute('fill', '#F59E0B');
        led.setAttribute('class', 'led-warning');
      } else {
        led.setAttribute('fill', '#10B981');
        led.setAttribute('class', 'led-healthy');
      }
      g.appendChild(led);

      // ── Node label text (strictly .textContent — untrusted) ─────
      const labelText = document.createElementNS(SVG_NS, 'text');
      labelText.setAttribute('x', String(cardX + cardW / 2 + 2)); // offset right of LED
      labelText.setAttribute('y', String(cardY + 18));
      labelText.setAttribute('text-anchor', 'middle');
      labelText.setAttribute('dominant-baseline', 'middle');
      labelText.setAttribute('font-size', '11');
      labelText.setAttribute('font-weight', '600');
      labelText.setAttribute('fill', '#F3F4F6');
      labelText.setAttribute('font-family', 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      labelText.setAttribute('letter-spacing', '0.01em');
      labelText.textContent = node.label || id;   // NEVER innerHTML — untrusted label
      g.appendChild(labelText);

      // ── Divider line ────────────────────────────────────────────
      const divider = document.createElementNS(SVG_NS, 'line');
      divider.setAttribute('x1', String(cardX + 1));
      divider.setAttribute('y1', String(cardY + 30));
      divider.setAttribute('x2', String(cardX + cardW - 1));
      divider.setAttribute('y2', String(cardY + 30));
      divider.setAttribute('stroke', 'rgba(255,255,255,0.06)');
      divider.setAttribute('stroke-width', '1');
      g.appendChild(divider);

      // ── Footer: Duration pill (rect-only — no <text> to avoid breaking the
      // E2E strict locator '#node-X text' which must match exactly ONE element)
      if (node.duration != null) {
        const pillBg = document.createElementNS(SVG_NS, 'rect');
        pillBg.setAttribute('x', String(cardX + 7));
        pillBg.setAttribute('y', String(cardY + 34));
        pillBg.setAttribute('width', '46');
        pillBg.setAttribute('height', '14');
        pillBg.setAttribute('rx', '3');
        pillBg.setAttribute('fill', 'rgba(17,24,55,0.8)');
        pillBg.setAttribute('stroke', 'rgba(99,102,241,0.25)');
        pillBg.setAttribute('stroke-width', '0.8');
        // Accessible tooltip — no visible <text> node to preserve strict locator
        const titleEl = document.createElementNS(SVG_NS, 'title');
        titleEl.textContent = `Latency: ${node.duration}ms`;
        pillBg.appendChild(titleEl);
        g.appendChild(pillBg);

        // Three small circles to hint "data present" — decorative, no text node
        for (let dot = 0; dot < 3; dot++) {
          const dotEl = document.createElementNS(SVG_NS, 'circle');
          dotEl.setAttribute('cx', String(cardX + 17 + dot * 8));
          dotEl.setAttribute('cy', String(cardY + 41));
          dotEl.setAttribute('r', '1.5');
          dotEl.setAttribute('fill', '#374151');
          g.appendChild(dotEl);
        }
      }

      // ── Pin badge (modernized toggle pill) ──────────────────────
      const pinBadge = createPinBadgeElement({
        nodeId: id,
        isPinned,
        x: Math.floor(cardW / 2) - 18,
        y: cardY - 8,
        onToggle: (nId, nextPinned) => this.handlePinToggle(nId, nextPinned),
      });
      g.appendChild(pinBadge);

      // Drag listener
      g.addEventListener('mousedown', (e) => this.handleDragStart(e, id, node));

      this.nodesGroup.appendChild(g);
    }

    // After first render, populate HUD
    this.updateHUD();
  }

  // ── Ghost Preview Overlay ─────────────────────────────────────────
  private renderGhostOverlay(): void {
    this.ghostGroup.innerHTML = '';
    if (!this.activeProposal) return;

    const { candidate_positions, region_node_ids } = this.activeProposal;
    const currentNodes = this.getState().graph_nodes;

    for (const nodeId of region_node_ids) {
      const pos = candidate_positions[nodeId];
      if (!pos) continue;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'ghost-node');
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      g.setAttribute('opacity', '0.75');

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '-66');
      rect.setAttribute('y', '-28');
      rect.setAttribute('width', '132');
      rect.setAttribute('height', '56');
      rect.setAttribute('rx', '10');
      rect.setAttribute('ry', '10');
      rect.setAttribute('fill', 'rgba(99,102,241,0.08)');
      rect.setAttribute('stroke', '#818CF8');
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('stroke-dasharray', '5,3');
      g.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '3');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '9.5');
      text.setAttribute('fill', '#A5B4FC');
      text.setAttribute('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
      // Safe: label is rendered with textContent, never innerHTML
      const rawLabel = currentNodes[nodeId]?.label ?? nodeId;
      text.textContent = rawLabel;
      g.appendChild(text);

      // Ghost indicator badge
      const badge = document.createElementNS(SVG_NS, 'text');
      badge.setAttribute('x', '0');
      badge.setAttribute('y', '-14');
      badge.setAttribute('text-anchor', 'middle');
      badge.setAttribute('font-size', '8');
      badge.setAttribute('fill', '#818CF8');
      badge.setAttribute('font-family', 'system-ui, sans-serif');
      badge.setAttribute('opacity', '0.8');
      badge.textContent = 'PREVIEW';
      g.appendChild(badge);

      this.ghostGroup.appendChild(g);
    }
  }

  // ── Status Pill ───────────────────────────────────────────────────
  private renderStatusPill(): void {
    this.statusPillGroup.innerHTML = '';
    if (!this.statusText) return;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'canvas-status-pill');
    g.setAttribute('transform', 'translate(24, 24)');

    // Backdrop
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '240');
    rect.setAttribute('height', '34');
    rect.setAttribute('rx', '17');
    rect.setAttribute('fill', 'rgba(9,13,22,0.88)');
    rect.setAttribute('stroke', 'rgba(6,182,212,0.4)');
    rect.setAttribute('stroke-width', '1');
    g.appendChild(rect);

    // Animated dot
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '17');
    circle.setAttribute('cy', '17');
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', '#06B6D4');
    circle.setAttribute('class', 'led-warning');
    g.appendChild(circle);

    // Text
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '32');
    text.setAttribute('y', '21');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', '600');
    text.setAttribute('fill', '#E0F2FE');
    text.setAttribute('font-family', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    text.setAttribute('letter-spacing', '0.01em');
    text.textContent = this.statusText;
    g.appendChild(text);

    this.statusPillGroup.appendChild(g);
  }

  // ── Pin Toggle ────────────────────────────────────────────────────
  private handlePinToggle(nodeId: string, nextPinned: boolean): void {
    const state = this.getState();
    const nextSet = new Set(state.pinned_node_ids);
    if (nextPinned) {
      nextSet.add(nodeId);
    } else {
      nextSet.delete(nodeId);
    }

    let nextState = reducePinnedNodeIds(state, nextSet);
    nextState = reduceGraphNodes(nextState, {
      [nodeId]: { pinned: nextPinned },
    });

    this.setState(nextState);

    activityBus.emit('state-update', {
      field: 'pinned_node_ids',
      reducer: 'last-write-wins',
      changed_ids: [nodeId],
      timestamp: Date.now(),
    });
  }

  // ── Drag & Viewport Handlers ─────────────────────────────────────
  private handleCanvasMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    // If mousedown was on or inside an interactive node or control, do not pan canvas
    const target = e.target as Element | null;
    if (target && target.closest && target.closest('.graph-node, .pin-badge, .status-pill-layer')) {
      return;
    }
    if (this.draggingNodeId) {
      return;
    }

    this.isPanning = true;
    this.panStart = { x: e.clientX, y: e.clientY };
    this.panViewStart = { x: this.viewX, y: this.viewY };
    this.svg.style.cursor = 'grabbing';
  }

  private handleDragStart(e: MouseEvent, nodeId: string, node: NodeRecord): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.isPanning = false;
    this.draggingNodeId = nodeId;
    const pt = this.getSVGCoordinates(e);
    this.dragOffset = {
      x: pt.x - node.x,
      y: pt.y - node.y,
    };
  }

  private handleDragMove(e: MouseEvent): void {
    if (this.draggingNodeId) {
      const pt = this.getSVGCoordinates(e);
      const newX = Math.round(pt.x - this.dragOffset.x);
      const newY = Math.round(pt.y - this.dragOffset.y);

      const state = this.getState();
      const nextState = reduceGraphNodes(state, {
        [this.draggingNodeId]: { x: newX, y: newY },
      });
      this.setState(nextState);

      // Fast-path visual update during drag
      const nodeEl = this.svg.getElementById(`node-${this.draggingNodeId}`);
      if (nodeEl) {
        nodeEl.setAttribute('transform', `translate(${newX}, ${newY})`);
      }
      return;
    }

    if (this.isPanning) {
      const rect = this.svg.getBoundingClientRect ? this.svg.getBoundingClientRect() : null;
      const rectWidth = (rect && rect.width) || this.width;
      const rectHeight = (rect && rect.height) || this.height;
      const dxClient = e.clientX - this.panStart.x;
      const dyClient = e.clientY - this.panStart.y;
      const dxSVG = dxClient * (this.viewWidth / rectWidth);
      const dySVG = dyClient * (this.viewHeight / rectHeight);

      this.viewX = this.panViewStart.x - dxSVG;
      this.viewY = this.panViewStart.y - dySVG;
      this.updateViewBox();
    }
  }

  private handleDragEnd(): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.svg.style.cursor = 'grab';
    }

    if (!this.draggingNodeId) return;
    const finishedId = this.draggingNodeId;
    this.draggingNodeId = null;
    this.render();
    activityBus.emit('state-update', {
      field: 'graph_nodes',
      reducer: 'merge-by-key',
      changed_ids: [finishedId],
      timestamp: Date.now(),
    });
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomSensitivity = 0.0015;
    const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);
    const targetScale = this.scale * zoomFactor;
    // Scale range strictly clamped between 0.5x and 2.0x
    const newScale = Math.min(2.0, Math.max(0.5, targetScale));

    if (Math.abs(newScale - this.scale) < 0.001) return;

    const cursor = this.getSVGCoordinates(e);
    const kX = (cursor.x - this.viewX) / this.viewWidth;
    const kY = (cursor.y - this.viewY) / this.viewHeight;

    const newViewWidth = this.width / newScale;
    const newViewHeight = this.height / newScale;

    this.viewX = cursor.x - kX * newViewWidth;
    this.viewY = cursor.y - kY * newViewHeight;
    this.viewWidth = newViewWidth;
    this.viewHeight = newViewHeight;
    this.scale = newScale;

    this.updateViewBox();
    this.updateZoomDisplay();
  }

  private updateViewBox(): void {
    this.svg.setAttribute(
      'viewBox',
      `${this.viewX} ${this.viewY} ${this.viewWidth} ${this.viewHeight}`
    );
  }

  private getSVGCoordinates(e: MouseEvent): { x: number; y: number } {
    if (this.svg.getScreenCTM) {
      const ctm = this.svg.getScreenCTM();
      if (ctm && this.svg.createSVGPoint) {
        const pt = this.svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const transformed = pt.matrixTransform(ctm.inverse());
        return { x: transformed.x, y: transformed.y };
      }
    }
    if (this.svg.getBoundingClientRect) {
      const rect = this.svg.getBoundingClientRect();
      const rectWidth = rect.width || this.width;
      const rectHeight = rect.height || this.height;
      const clientX = e.clientX - (rect.left || 0);
      const clientY = e.clientY - (rect.top || 0);
      return {
        x: this.viewX + (clientX / rectWidth) * this.viewWidth,
        y: this.viewY + (clientY / rectHeight) * this.viewHeight,
      };
    }
    return {
      x: this.viewX + e.clientX,
      y: this.viewY + e.clientY,
    };
  }

  public getViewport(): { viewX: number; viewY: number; viewWidth: number; viewHeight: number; scale: number } {
    return {
      viewX: this.viewX,
      viewY: this.viewY,
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      scale: this.scale,
    };
  }

  /** Calculate collective bounding box and centroid of all graph nodes */
  private calculateGraphBoundingBox(nodes: Record<string, NodeRecord>): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
  } {
    const nodeEntries = Object.values(nodes);
    if (nodeEntries.length === 0) {
      return {
        minX: 0,
        maxX: this.width,
        minY: 0,
        maxY: this.height,
        centerX: this.width / 2,
        centerY: this.height / 2,
      };
    }

    const halfW = 66; // cardW / 2 (cardW = 132)
    const halfH = 28; // cardH / 2 (cardH = 56)

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of nodeEntries) {
      if (n.x - halfW < minX) minX = n.x - halfW;
      if (n.x + halfW > maxX) maxX = n.x + halfW;
      if (n.y - halfH < minY) minY = n.y - halfH;
      if (n.y + halfH > maxY) maxY = n.y + halfH;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return { minX, maxX, minY, maxY, centerX, centerY };
  }

  /**
   * Auto-centers the graph bounding box in the viewport, accounting for UI overlays:
   * top header padding (~70px) and bottom telemetry dock padding (~90px).
   * @param nodes - Node records to center (defaults to current state nodes)
   * @param targetScale - Viewport zoom factor (defaults to 1.15x for crisp readability)
   */
  public autoCenter(
    nodes?: Record<string, NodeRecord>,
    targetScale: number = 1.15
  ): void {
    const activeNodes = nodes || this.getState().graph_nodes;
    const { centerX, centerY } = this.calculateGraphBoundingBox(activeNodes);

    // Clamped scale
    this.scale = Math.min(2.0, Math.max(0.5, targetScale));
    this.viewWidth = this.width / this.scale;
    this.viewHeight = this.height / this.scale;

    // Viewport usable center offsets (70px top header, 90px bottom dock)
    const topPadding = 70;
    const bottomPadding = 90;
    const usableHeight = Math.max(200, this.height - topPadding - bottomPadding);
    const usableCenterY = topPadding + usableHeight / 2;
    const usableCenterX = this.width / 2;

    // Align graph centroid with the usable viewport center
    this.viewX = Math.round(centerX - (usableCenterX / this.scale));
    this.viewY = Math.round(centerY - (usableCenterY / this.scale));

    this.updateViewBox();
    this.updateZoomDisplay();
  }

  public resetViewport(): void {
    this.autoCenter(this.getState().graph_nodes, 1.15);
  }

  /** Zoom in viewport by a step factor (default: +0.15) */
  public zoomIn(step: number = 0.15): void {
    this.zoomBy(step);
  }

  /** Zoom out viewport by a step factor (default: -0.15) */
  public zoomOut(step: number = 0.15): void {
    this.zoomBy(-step);
  }

  /** Adjust viewport zoom scale centered on the current visible center */
  private zoomBy(deltaScale: number): void {
    const targetScale = Math.min(2.0, Math.max(0.5, this.scale + deltaScale));
    if (Math.abs(targetScale - this.scale) < 0.001) return;

    // Center of current view
    const centerX = this.viewX + this.viewWidth / 2;
    const centerY = this.viewY + this.viewHeight / 2;

    const newViewWidth = this.width / targetScale;
    const newViewHeight = this.height / targetScale;

    this.viewX = centerX - newViewWidth / 2;
    this.viewY = centerY - newViewHeight / 2;
    this.viewWidth = newViewWidth;
    this.viewHeight = newViewHeight;
    this.scale = targetScale;

    this.updateViewBox();
    this.updateZoomDisplay();
  }

  /** Update the floating zoom level text badge in the DOM */
  public updateZoomDisplay(): void {
    if (typeof document === 'undefined') return;
    const label = document.getElementById('lbl-zoom-level');
    if (label) {
      label.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }
}
