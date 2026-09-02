/**
 * Pin Badges Component for Nexus Weave SVG Nodes — Premium Redesign.
 * Renders a sleek interactive SVG lock/pin toggle pill with active cyan glow state.
 * INTERFACE_OBSERVABILITY_SYSTEM.md Section 2 / Section 4a.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PinBadgeOptions {
  nodeId: string;
  isPinned: boolean;
  onToggle: (nodeId: string, nextPinned: boolean) => void;
  size?: number;
  x?: number;
  y?: number;
}

/**
 * Creates an interactive SVG group element representing the node pin toggle badge.
 * Pinned state: Cyan #06B6D4 glowing lock icon pill.
 * Unpinned state: Translucent grey subtle pill.
 */
export function createPinBadgeElement(options: PinBadgeOptions): SVGGElement {
  const { nodeId, isPinned, onToggle, x = 0, y = 0 } = options;

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', `pin-badge ${isPinned ? 'pinned' : 'unpinned'}`);
  g.setAttribute('transform', `translate(${x}, ${y})`);
  g.setAttribute('role', 'button');
  g.setAttribute('tabindex', '0');
  g.setAttribute('cursor', 'pointer');
  g.setAttribute('aria-label', `${isPinned ? 'Unpin' : 'Pin'} node ${nodeId}`);

  // ── Pill background ──────────────────────────────────────────────
  const pillW = 22;
  const pillH = 14;

  const pillBg = document.createElementNS(SVG_NS, 'rect');
  pillBg.setAttribute('x', '0');
  pillBg.setAttribute('y', '0');
  pillBg.setAttribute('width', String(pillW));
  pillBg.setAttribute('height', String(pillH));
  pillBg.setAttribute('rx', '7');
  pillBg.setAttribute('ry', '7');

  if (isPinned) {
    pillBg.setAttribute('fill', 'rgba(6,182,212,0.2)');
    pillBg.setAttribute('stroke', '#06B6D4');
    pillBg.setAttribute('stroke-width', '1');
  } else {
    pillBg.setAttribute('fill', 'rgba(17,24,39,0.7)');
    pillBg.setAttribute('stroke', 'rgba(255,255,255,0.12)');
    pillBg.setAttribute('stroke-width', '1');
  }
  g.appendChild(pillBg);

  // ── Lock icon SVG path ───────────────────────────────────────────
  // Centered within the pill at (pillW/2, pillH/2)
  const iconG = document.createElementNS(SVG_NS, 'g');
  iconG.setAttribute('transform', `translate(${pillW / 2 - 4}, ${pillH / 2 - 4.5})`);

  if (isPinned) {
    // Closed lock — filled cyan
    const lockBody = document.createElementNS(SVG_NS, 'rect');
    lockBody.setAttribute('x', '1');
    lockBody.setAttribute('y', '4');
    lockBody.setAttribute('width', '6');
    lockBody.setAttribute('height', '5');
    lockBody.setAttribute('rx', '1');
    lockBody.setAttribute('fill', '#06B6D4');
    iconG.appendChild(lockBody);

    const lockShackle = document.createElementNS(SVG_NS, 'path');
    lockShackle.setAttribute('d', 'M2,4 V2.5 Q4,0.5 6,2.5 V4');
    lockShackle.setAttribute('fill', 'none');
    lockShackle.setAttribute('stroke', '#06B6D4');
    lockShackle.setAttribute('stroke-width', '1.2');
    lockShackle.setAttribute('stroke-linecap', 'round');
    iconG.appendChild(lockShackle);

    // Keyhole
    const keyhole = document.createElementNS(SVG_NS, 'circle');
    keyhole.setAttribute('cx', '4');
    keyhole.setAttribute('cy', '6.5');
    keyhole.setAttribute('r', '0.8');
    keyhole.setAttribute('fill', 'rgba(9,13,22,0.7)');
    iconG.appendChild(keyhole);
  } else {
    // Open lock — grey subtle
    const lockBody = document.createElementNS(SVG_NS, 'rect');
    lockBody.setAttribute('x', '1');
    lockBody.setAttribute('y', '4');
    lockBody.setAttribute('width', '6');
    lockBody.setAttribute('height', '5');
    lockBody.setAttribute('rx', '1');
    lockBody.setAttribute('fill', 'rgba(100,116,139,0.5)');
    iconG.appendChild(lockBody);

    const lockShackle = document.createElementNS(SVG_NS, 'path');
    lockShackle.setAttribute('d', 'M5.5,4 V2.5 Q4,0.5 2,2.5');
    lockShackle.setAttribute('fill', 'none');
    lockShackle.setAttribute('stroke', 'rgba(100,116,139,0.6)');
    lockShackle.setAttribute('stroke-width', '1.2');
    lockShackle.setAttribute('stroke-linecap', 'round');
    iconG.appendChild(lockShackle);
  }

  g.appendChild(iconG);

  // ── Interaction ──────────────────────────────────────────────────
  const handleToggle = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle(nodeId, !isPinned);
  };

  g.addEventListener('mousedown', (e) => e.stopPropagation());
  g.addEventListener('click', handleToggle);
  g.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleToggle(e);
    }
  });

  return g;
}
