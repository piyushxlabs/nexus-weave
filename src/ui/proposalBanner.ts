/**
 * Proposal Review Banner Component — Premium Redesign.
 * Surfaces Human-in-the-Loop approval gate for large or ambiguous mutations.
 * Premium amber/gold warning aesthetic with glassmorphism backdrop.
 * INTERFACE_OBSERVABILITY_SYSTEM.md Section 5.
 */

import type { ProposedMutation } from '../state/schema.js';
import { activityBus } from './activityBus.js';

export interface ProposalBannerOptions {
  proposal: ProposedMutation;
  onApprove: (proposal: ProposedMutation) => Promise<void> | void;
  onDiscard: (proposal: ProposedMutation) => void;
}

/**
 * Renders the interactive Approval Gate banner into a container element.
 */
export function renderProposalBanner(
  container: HTMLElement,
  options: ProposalBannerOptions
): HTMLElement {
  const { proposal, onApprove, onDiscard } = options;

  // Remove existing proposal banner if any
  const existing = document.getElementById('nexus-proposal-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'nexus-proposal-banner';
  banner.className = 'proposal-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'polite');

  const beforeCrossings = proposal.initial_crossings ?? 0;
  const afterCrossings = proposal.candidate_crossings ?? 0;
  const nodeCount = proposal.region_node_ids.length;
  const reasonText =
    (proposal as any).reason ||
    'Threshold exceeded (> 35% of graph) — Human-in-the-Loop review mandated.';

  banner.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 20px;
      background: rgba(9,13,22,0.94);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      border-bottom: 1px solid rgba(245,158,11,0.25);
      color: #E2E8F0;
      font-size: 12px;
      box-shadow: 0 1px 0 rgba(245,158,11,0.08) inset;
    ">
      <!-- Left: Badge + info -->
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 5px;
          background: rgba(245,158,11,0.15);
          border: 1px solid rgba(245,158,11,0.3);
          color: #FCD34D;
          font-weight: 700;
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
        ">
          <span style="width:5px;height:5px;border-radius:50%;background:#F59E0B;animation:pulse-dot 1.5s ease-in-out infinite;" aria-hidden="true"></span>
          Approval Required
        </span>

        <div>
          <span style="color: #D1D5DB; font-weight: 600; font-size: 12px;">Proposed Layout Untangling:</span>
          <span style="color: #9CA3AF; margin-left: 6px; font-size: 11.5px;">
            Untangle region of <strong style="color:#E2E8F0;">${nodeCount} nodes</strong>
            (Edge crossings:
            <span style="color: #F87171; text-decoration: line-through;">${beforeCrossings}</span>
            ➔
            <span style="color: #34D399; font-weight: 700;">${afterCrossings}</span>).
          </span>
          <span style="display: block; font-size: 10.5px; color: #6B7280; margin-top: 2px;">${reasonText}</span>
        </div>
      </div>

      <!-- Right: Action buttons -->
      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        <button id="proposal-approve-btn" style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 16px;
          border-radius: 6px;
          background: #10B981;
          color: #FFFFFF;
          border: none;
          font-size: 11.5px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s;
          white-space: nowrap;
          letter-spacing: 0.01em;
        "
        onmouseover="this.style.background='#059669'; this.style.boxShadow='0 0 12px rgba(16,185,129,0.35)'"
        onmouseout="this.style.background='#10B981'; this.style.boxShadow='none'"
        aria-label="Approve &amp; Apply Layout Mutation">
          ✓ Approve &amp; Apply
        </button>

        <button id="proposal-discard-btn" style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 14px;
          border-radius: 6px;
          background: rgba(255,255,255,0.04);
          color: #9CA3AF;
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 11.5px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.18)'"
        onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(255,255,255,0.1)'"
        aria-label="Discard Layout Proposal">
          ✕ Discard
        </button>
      </div>
    </div>
  `;

  const approveBtn = banner.querySelector('#proposal-approve-btn') as HTMLButtonElement;
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true;
      approveBtn.textContent = 'Applying…';
      approveBtn.style.opacity = '0.7';
      try {
        await onApprove(proposal);
        banner.remove();
      } catch {
        approveBtn.disabled = false;
        approveBtn.textContent = 'Failed — Try Again';
        approveBtn.style.opacity = '1';
      }
    });
  }

  const discardBtn = banner.querySelector('#proposal-discard-btn') as HTMLButtonElement;
  if (discardBtn) {
    discardBtn.addEventListener('click', () => {
      banner.remove();
      onDiscard(proposal);
    });
  }

  container.appendChild(banner);
  return banner;
}

/**
 * Automatically binds the proposal banner to in-page activity bus events.
 */
export function setupProposalBannerListener(
  container: HTMLElement,
  handlers: {
    onApprove: (proposal: ProposedMutation) => Promise<void> | void;
    onDiscard: (proposal: ProposedMutation) => void;
  }
): () => void {
  return activityBus.subscribe('approval-required', (evt) => {
    const detail = evt.detail;
    const proposal: ProposedMutation = {
      tool_call_id: detail.tool_call_id,
      tool_name: 'minimize_edge_crossings',
      region_node_ids: detail.region_node_ids,
      candidate_positions: (detail.preview?.candidate_positions as Record<string, { x: number; y: number }>) || {},
      candidate_crossings: (detail.preview?.candidate_crossings as number) ?? 0,
      initial_crossings: (detail.preview?.initial_crossings as number) ?? 0,
      status: 'proposed',
    };

    renderProposalBanner(container, {
      proposal,
      onApprove: handlers.onApprove,
      onDiscard: handlers.onDiscard,
    });
  });
}
