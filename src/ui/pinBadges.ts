/**
 * Pin Badges Component for Nexus Weave SVG Nodes.
 * Renders an accessible, interactive SVG pushpin badge.
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
 */
export function createPinBadgeElement(options: PinBadgeOptions): SVGGElement {
  const { nodeId, isPinned, onToggle, size = 16, x = 0, y = 0 } = options;

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', `pin-badge ${isPinned ? 'pinned' : 'unpinned'}`);
  g.setAttribute('transform', `translate(${x}, ${y})`);
  g.setAttribute('role', 'button');
  g.setAttribute('tabindex', '0');
  g.setAttribute('cursor', 'pointer');
  g.setAttribute('aria-label', `${isPinned ? 'Unpin' : 'Pin'} node ${nodeId}`);

  // Background hit circle
  const hitCircle = document.createElementNS(SVG_NS, 'circle');
  hitCircle.setAttribute('cx', String(size / 2));
  hitCircle.setAttribute('cy', String(size / 2));
  hitCircle.setAttribute('r', String(size * 0.75));
  hitCircle.setAttribute('fill', isPinned ? 'rgba(245, 158, 11, 0.2)' : 'rgba(15, 23, 42, 0.6)');
  hitCircle.setAttribute('stroke', isPinned ? '#f59e0b' : '#64748b');
  hitCircle.setAttribute('stroke-width', '1.5');
  g.appendChild(hitCircle);

  // SVG pushpin icon path
  const path = document.createElementNS(SVG_NS, 'path');
  // 12x12 pushpin icon path
  path.setAttribute(
    'd',
    'M4 2h4l1 3-2 1v3l-1 2-1-2V6L3 5l1-3z'
  );
  path.setAttribute('transform', `translate(${size * 0.15}, ${size * 0.1}) scale(${size / 12})`);
  path.setAttribute('fill', isPinned ? '#f59e0b' : '#94a3b8');
  g.appendChild(path);

  const handleToggle = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle(nodeId, !isPinned);
  };

  g.addEventListener('click', handleToggle);
  g.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleToggle(e);
    }
  });

  return g;
}
