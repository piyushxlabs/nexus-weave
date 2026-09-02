import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createPinBadgeElement } from '../../src/ui/pinBadges.js';
import { renderUnsupportedBanner, openDemoModal, CHROME_TESTING_FLAG } from '../../src/ui/unsupportedBanner.js';
import { renderProposalBanner } from '../../src/ui/proposalBanner.js';
import { ActivityPanel } from '../../src/ui/activityPanel.js';
import { GraphCanvas } from '../../src/ui/canvas.js';
import { activityBus } from '../../src/ui/activityBus.js';
import { createInitialState, type ProposedMutation } from '../../src/state/schema.js';
import { createSeedGraph } from '../../src/state/seedGraph.js';

// ============================================================================
// Lightweight Mock DOM for Unit Tests in Node Environment
// ============================================================================

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public attributes: Map<string, string> = new Map();
  public style: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentNode: MockElement | null = null;
  public eventListeners: Map<string, Array<(e: any) => void>> = new Map();
  private _textContent: string = '';
  private _innerHTML: string = '';
  public disabled: boolean = false;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = val;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    // Parse simple IDs and text from innerHTML if injected
    const idMatches = html.matchAll(/id=["']([^"']+)["']/g);
    for (const match of idMatches) {
      const child = new MockElement('DIV');
      child.id = match[1];
      this.children.push(child);
    }
  }

  setAttribute(k: string, v: string): void {
    this.attributes.set(k, v);
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
  }

  getAttribute(k: string): string | null {
    if (k === 'id') return this.id;
    if (k === 'class') return this.className;
    return this.attributes.get(k) ?? null;
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }

  addEventListener(type: string, handler: (e: any) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(handler);
  }

  dispatchEvent(e: any): boolean {
    const list = this.eventListeners.get(e.type) || [];
    for (const h of list) h(e);
    return true;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findChildById(id);
    }
    return this.children[0] || null;
  }

  querySelectorAll(selector: string): MockElement[] {
    return [...this.children];
  }

  private findChildById(id: string): MockElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findChildById(id);
      if (found) return found;
    }
    return null;
  }

  // SVG Specific methods
  getScreenCTM() {
    return null;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1200, height: 800 };
  }
}

describe('Step 16: UI Components & Affordances', () => {
  let g: any;
  let mockDoc: any;
  let mockBody: MockElement;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    g = globalThis as any;
    mockBody = new MockElement('BODY');
    mockDoc = {
      createElement: (tag: string) => new MockElement(tag),
      createElementNS: (_ns: string, tag: string) => new MockElement(tag),
      getElementById: (id: string) => mockBody.querySelector(`#${id}`),
      body: mockBody,
    };
    g.document = mockDoc;

    writeTextMock = vi.fn().mockResolvedValue(undefined);
    try {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        configurable: true,
      });
    } catch {
      // If navigator is not configurable, fallback
    }
  });

  afterEach(() => {
    delete g.document;
  });

  describe('Pin Badges Component (pinBadges.ts)', () => {
    it('creates an accessible SVG pin badge group with correct attributes', () => {
      const onToggle = vi.fn();
      const badge = createPinBadgeElement({
        nodeId: 'order-service',
        isPinned: false,
        onToggle,
      }) as unknown as MockElement;

      expect(badge.getAttribute('role')).toBe('button');
      expect(badge.getAttribute('tabindex')).toBe('0');
      expect(badge.getAttribute('aria-label')).toBe('Pin node order-service');
      expect(badge.className).toContain('unpinned');
    });

    it('triggers onToggle callback with inverted value when clicked or on Enter key', () => {
      const onToggle = vi.fn();
      const badge = createPinBadgeElement({
        nodeId: 'payment-service',
        isPinned: true,
        onToggle,
      }) as unknown as MockElement;

      expect(badge.getAttribute('aria-label')).toBe('Unpin node payment-service');

      // Test click
      badge.dispatchEvent({
        type: 'click',
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      });
      expect(onToggle).toHaveBeenCalledWith('payment-service', false);

      // Test keyboard Enter
      badge.dispatchEvent({
        type: 'keydown',
        key: 'Enter',
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      });
      expect(onToggle).toHaveBeenCalledWith('payment-service', false);
    });
  });

  describe('Cold-Judge Fallback Banner (unsupportedBanner.ts)', () => {
    it('renders non-blocking banner with inactive status badge and setup guidance', () => {
      const container = new MockElement('DIV') as unknown as HTMLElement;
      const banner = renderUnsupportedBanner(container) as unknown as MockElement;

      expect(banner.id).toBe('unsupported-browser-banner');
      expect(banner.getAttribute('role')).toBe('status');
      expect(banner.getAttribute('aria-live')).toBe('polite');
      expect(banner.innerHTML).toContain('WebMCP Environment: Inactive (Standard Browser)');
      expect(banner.innerHTML).toContain(CHROME_TESTING_FLAG);
    });

    it('handles clipboard copy button click', async () => {
      const container = new MockElement('DIV') as unknown as HTMLElement;
      const banner = renderUnsupportedBanner(container) as unknown as MockElement;
      const copyBtn = banner.querySelector('#copy-flag-btn');

      expect(copyBtn).not.toBeNull();
      copyBtn!.dispatchEvent({ type: 'click' });

      if (navigator.clipboard) {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(CHROME_TESTING_FLAG);
      }
    });

    it('opens interactive walkthrough demo modal', () => {
      const modal = openDemoModal() as unknown as MockElement;
      expect(modal.id).toBe('nexus-demo-modal');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.innerHTML).toContain('2-Minute WebMCP Walkthrough');
    });
  });

  describe('Proposal Review Banner (proposalBanner.ts)', () => {
    it('renders proposal details, before/after crossing counts, and reason', () => {
      const container = new MockElement('DIV') as unknown as HTMLElement;
      const proposal: ProposedMutation = {
        tool_call_id: 'call_prop_1',
        tool_name: 'minimize_edge_crossings',
        region_node_ids: ['order-service', 'payment-service', 'inventory-service'],
        candidate_positions: {},
        initial_crossings: 8,
        candidate_crossings: 2,
        status: 'proposed',
      };

      const onApprove = vi.fn();
      const onDiscard = vi.fn();

      const banner = renderProposalBanner(container, {
        proposal,
        onApprove,
        onDiscard,
      }) as unknown as MockElement;

      expect(banner.id).toBe('nexus-proposal-banner');
      expect(banner.innerHTML).toContain('Approval Required');
      expect(banner.innerHTML).toContain('3 nodes');
      expect(banner.innerHTML).toContain('8');
      expect(banner.innerHTML).toContain('2');
      expect(banner.innerHTML).toContain('Human-in-the-Loop review mandated');

      const approveBtn = banner.querySelector('#proposal-approve-btn');
      expect(approveBtn).not.toBeNull();
      approveBtn!.dispatchEvent({ type: 'click' });
      expect(onApprove).toHaveBeenCalledWith(proposal);

      const discardBtn = banner.querySelector('#proposal-discard-btn');
      expect(discardBtn).not.toBeNull();
      discardBtn!.dispatchEvent({ type: 'click' });
      expect(onDiscard).toHaveBeenCalledWith(proposal);
    });
  });

  describe('Activity & Telemetry Panel (activityPanel.ts)', () => {
    it('subscribes to activityBus and records in-progress, completed, and error tool calls', () => {
      const container = new MockElement('DIV') as unknown as HTMLElement;
      const panel = new ActivityPanel(container);

      // Emit tool start
      activityBus.emit('tool-invocation-start', {
        tool_call_id: 'call_1',
        tool_name: 'detect_cycles_and_bottlenecks',
        args: {},
        timestamp: 1000,
      });

      let entries = panel.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('in_progress');

      // Emit tool result
      activityBus.emit('tool-invocation-result', {
        tool_call_id: 'call_1',
        tool_name: 'detect_cycles_and_bottlenecks',
        success: true,
        result: {
          cyclic_edge_ids: ['e1', 'e2'],
          bottleneck_nodes: [{ node_id: 'order-service', centrality_score: 0.85 }],
        },
        timestamp: 1050,
      });

      entries = panel.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].status).toBe('completed');
      expect(entries[0].summary).toContain('Found 2 cyclic edges, 1 bottleneck nodes');
      expect(entries[0].duration_ms).toBe(50);

      // Emit error
      activityBus.emit('tool-invocation-error', {
        tool_call_id: 'call_2',
        tool_name: 'compute_critical_path',
        success: false,
        error: 'Graph contains cycles.',
        timestamp: 2000,
      });

      entries = panel.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].status).toBe('error');
      expect(entries[0].summary).toContain('Failed: Graph contains cycles.');

      panel.destroy();
    });
  });

  describe('Reactive SVG GraphCanvas (canvas.ts)', () => {
    it('initializes SVG canvas structure with layers, markers, and renders seed graph', () => {
      const svg = new MockElement('SVG') as unknown as SVGSVGElement;
      let state = createInitialState();
      const seed = createSeedGraph();
      state.graph_nodes = seed.nodes;
      state.graph_edges = seed.edges;

      const canvas = new GraphCanvas({
        svgElement: svg,
        getState: () => state,
        setState: (s) => {
          state = s;
        },
      });

      expect(svg.getAttribute('viewBox')).toContain('-22 -89');
      // Children should include defs, edges-layer, ghost-layer, nodes-layer, status-pill-layer
      expect(svg.children.length).toBeGreaterThanOrEqual(5);

      canvas.destroy();
    });

    it('supports canvas panning, wheel zooming, and viewport reset', () => {
      const svg = new MockElement('SVG') as unknown as SVGSVGElement;
      let state = createInitialState();
      const seed = createSeedGraph();
      state.graph_nodes = seed.nodes;
      state.graph_edges = seed.edges;

      const canvas = new GraphCanvas({
        svgElement: svg,
        getState: () => state,
        setState: (s) => {
          state = s;
        },
      });

      // Initial auto-centered viewport state (scale: 1.15x)
      const initialViewport = canvas.getViewport();
      expect(initialViewport.viewX).toBe(-22);
      expect(initialViewport.viewY).toBe(-89);
      expect(initialViewport.scale).toBe(1.15);
      expect(svg.getAttribute('viewBox')).toContain('-22 -89');

      // Test wheel zoom in (negative deltaY)
      const mockWheelEventIn = {
        type: 'wheel',
        deltaY: -100,
        clientX: 600,
        clientY: 400,
        preventDefault: () => {},
      };
      (svg as any).dispatchEvent(mockWheelEventIn);

      const zoomedViewport = canvas.getViewport();
      expect(zoomedViewport.scale).toBeGreaterThan(1.15);
      expect(zoomedViewport.scale).toBeLessThanOrEqual(2.0);

      // Test wheel zoom out (positive deltaY)
      const mockWheelEventOut = {
        type: 'wheel',
        deltaY: 500,
        clientX: 600,
        clientY: 400,
        preventDefault: () => {},
      };
      (svg as any).dispatchEvent(mockWheelEventOut);

      const zoomedOutViewport = canvas.getViewport();
      expect(zoomedOutViewport.scale).toBeLessThan(zoomedViewport.scale);
      expect(zoomedOutViewport.scale).toBeGreaterThanOrEqual(0.5);

      // Test resetViewport restores initial auto-centered coordinates
      canvas.resetViewport();
      const resetViewport = canvas.getViewport();
      expect(resetViewport.viewX).toBe(-22);
      expect(resetViewport.viewY).toBe(-89);
      expect(resetViewport.scale).toBe(1.15);
      expect(svg.getAttribute('viewBox')).toContain('-22 -89');

      canvas.destroy();
    });
  });
});
