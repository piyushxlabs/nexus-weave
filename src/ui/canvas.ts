/**
 * Reactive SVG Graph Canvas Component.
 * High-performance, accessible SVG graph rendering with 60 FPS CSS transitions,
 * cyclic/critical annotations, ghost-preview overlay, and direct-manipulation dragging.
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

  private activeProposal: ProposedMutation | null = null;
  private statusText: string | null = null;

  private unsubscribeFns: Array<() => void> = [];
  private draggingNodeId: string | null = null;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(options: CanvasOptions) {
    this.svg = options.svgElement;
    this.getState = options.getState;
    this.setState = options.setState;
    this.width = options.width || 1200;
    this.height = options.height || 800;

    this.initCanvasStructure();
    this.setupBusListeners();
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
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.style.backgroundColor = '#0f172a';
    this.svg.style.userSelect = 'none';

    // Inject SVG Marker Defs (arrowheads)
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <!-- Standard edge marker -->
      <marker id="arrow-standard" viewBox="0 -5 10 10" refX="28" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#475569" />
      </marker>
      <!-- Cyclic warning edge marker -->
      <marker id="arrow-cyclic" viewBox="0 -5 10 10" refX="28" refY="0" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#ef4444" />
      </marker>
      <!-- Critical path edge marker -->
      <marker id="arrow-critical" viewBox="0 -5 10 10" refX="28" refY="0" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#06b6d4" />
      </marker>
      <!-- Ghost preview marker -->
      <marker id="arrow-ghost" viewBox="0 -5 10 10" refX="28" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#94a3b8" />
      </marker>
    `;
    this.svg.appendChild(defs);

    // Create rendering layers
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

    // Global SVG mousemove and mouseup for drag interactions
    this.svg.addEventListener('mousemove', (e) => this.handleDragMove(e));
    this.svg.addEventListener('mouseup', () => this.handleDragEnd());
    this.svg.addEventListener('mouseleave', () => this.handleDragEnd());
  }

  private setupBusListeners(): void {
    // 1. Tool start — show status pill
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-start', (e) => {
        const { tool_name } = e.detail;
        const labels: Record<string, string> = {
          get_graph_topology: 'Reading graph topology…',
          detect_cycles_and_bottlenecks: 'Checking for cycles…',
          compute_critical_path: 'Computing critical path…',
          minimize_edge_crossings: 'Untangling region…',
          pin_and_group_region: 'Updating pins…',
        };
        this.statusText = labels[tool_name] || 'Processing…';
        this.renderStatusPill();
      })
    );

    // 2. State update — re-render with eased transitions
    this.unsubscribeFns.push(
      activityBus.subscribe('state-update', () => {
        this.render();
      })
    );

    // 3. Approval required — render ghost-preview overlay
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
      line.setAttribute('x1', String(source.x));
      line.setAttribute('y1', String(source.y));
      line.setAttribute('x2', String(target.x));
      line.setAttribute('y2', String(target.y));

      // CSS transition for smooth line animation
      line.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

      if (edge.is_cyclic) {
        // Red dashed warning stroke
        line.setAttribute('class', 'cyclic-edge');
        line.setAttribute('stroke', '#ef4444');
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-dasharray', '6,4');
        line.setAttribute('marker-end', 'url(#arrow-cyclic)');
      } else if (edge.is_critical) {
        // Cyan glowing critical path stroke
        line.setAttribute('class', 'critical-edge');
        line.setAttribute('stroke', '#06b6d4');
        line.setAttribute('stroke-width', '3.5');
        line.setAttribute('marker-end', 'url(#arrow-critical)');
      } else {
        // Standard edge
        line.setAttribute('class', 'standard-edge');
        line.setAttribute('stroke', '#475569');
        line.setAttribute('stroke-width', '1.8');
        line.setAttribute('marker-end', 'url(#arrow-standard)');
      }

      this.edgesGroup.appendChild(line);
    }
  }

  private renderNodes(
    nodes: Record<string, NodeRecord>,
    pinnedIds: ReadonlySet<string>
  ): void {
    this.nodesGroup.innerHTML = '';

    for (const [id, node] of Object.entries(nodes)) {
      const isPinned = pinnedIds.has(id) || node.pinned === true;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('id', `node-${id}`);
      g.setAttribute('class', `graph-node ${isPinned ? 'pinned' : ''}`);
      g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      g.setAttribute('cursor', 'grab');

      // 60 FPS CSS eased transition — NEVER instant snaps!
      g.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

      // Card rectangle
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '-55');
      rect.setAttribute('y', '-22');
      rect.setAttribute('width', '110');
      rect.setAttribute('height', '44');
      rect.setAttribute('rx', '8');
      rect.setAttribute('ry', '8');
      rect.setAttribute('fill', isPinned ? '#1e293b' : '#0f172a');
      rect.setAttribute('stroke', isPinned ? '#f59e0b' : '#334155');
      rect.setAttribute('stroke-width', isPinned ? '2' : '1.5');
      g.appendChild(rect);

      // Label text (untrusted, strictly textContent)
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '3');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '500');
      text.setAttribute('fill', '#f1f5f9');
      text.setAttribute('font-family', 'sans-serif');
      text.textContent = node.label || id;
      g.appendChild(text);

      // Pin badge affordance
      const pinBadge = createPinBadgeElement({
        nodeId: id,
        isPinned,
        x: 35,
        y: -30,
        onToggle: (nId, nextPinned) => this.handlePinToggle(nId, nextPinned),
      });
      g.appendChild(pinBadge);

      // Drag interaction listeners
      g.addEventListener('mousedown', (e) => this.handleDragStart(e, id, node));

      this.nodesGroup.appendChild(g);
    }
  }

  private renderGhostOverlay(): void {
    this.ghostGroup.innerHTML = '';
    if (!this.activeProposal) return;

    const { candidate_positions, region_node_ids } = this.activeProposal;
    const currentNodes = this.getState().graph_nodes;

    // Render ghost preview nodes
    for (const nodeId of region_node_ids) {
      const pos = candidate_positions[nodeId];
      if (!pos) continue;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'ghost-node');
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      g.setAttribute('opacity', '0.7');

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', '-55');
      rect.setAttribute('y', '-22');
      rect.setAttribute('width', '110');
      rect.setAttribute('height', '44');
      rect.setAttribute('rx', '8');
      rect.setAttribute('ry', '8');
      rect.setAttribute('fill', 'rgba(99, 102, 241, 0.15)');
      rect.setAttribute('stroke', '#818cf8');
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('stroke-dasharray', '4,4');
      g.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '3');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#c7d2fe');
      text.textContent = currentNodes[nodeId]?.label ? `Preview: ${currentNodes[nodeId].label}` : `Preview: ${nodeId}`;
      g.appendChild(text);

      this.ghostGroup.appendChild(g);
    }
  }

  private renderStatusPill(): void {
    this.statusPillGroup.innerHTML = '';
    if (!this.statusText) return;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'canvas-status-pill');
    g.setAttribute('transform', 'translate(30, 40)');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '220');
    rect.setAttribute('height', '32');
    rect.setAttribute('rx', '16');
    rect.setAttribute('fill', 'rgba(15, 23, 42, 0.85)');
    rect.setAttribute('stroke', '#38bdf8');
    rect.setAttribute('stroke-width', '1.5');
    g.appendChild(rect);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '16');
    circle.setAttribute('cy', '16');
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', '#38bdf8');
    g.appendChild(circle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '30');
    text.setAttribute('y', '20');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', '600');
    text.setAttribute('fill', '#e0f2fe');
    text.setAttribute('font-family', 'sans-serif');
    text.textContent = this.statusText;
    g.appendChild(text);

    this.statusPillGroup.appendChild(g);
  }

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

  private handleDragStart(e: MouseEvent, nodeId: string, node: NodeRecord): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.draggingNodeId = nodeId;
    const pt = this.getSVGCoordinates(e);
    this.dragOffset = {
      x: pt.x - node.x,
      y: pt.y - node.y,
    };
  }

  private handleDragMove(e: MouseEvent): void {
    if (!this.draggingNodeId) return;
    const pt = this.getSVGCoordinates(e);
    const newX = Math.round(pt.x - this.dragOffset.x);
    const newY = Math.round(pt.y - this.dragOffset.y);

    const state = this.getState();
    const nextState = reduceGraphNodes(state, {
      [this.draggingNodeId]: { x: newX, y: newY },
    });
    this.setState(nextState);

    // Fast-path visual coordinate update during drag
    const nodeEl = this.svg.getElementById(`node-${this.draggingNodeId}`);
    if (nodeEl) {
      nodeEl.setAttribute('transform', `translate(${newX}, ${newY})`);
    }
  }

  private handleDragEnd(): void {
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

  private getSVGCoordinates(e: MouseEvent): { x: number; y: number } {
    const ctm = this.svg.getScreenCTM();
    if (ctm) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const rect = this.svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }
}
