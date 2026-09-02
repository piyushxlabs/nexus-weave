/**
 * Proposal Review Banner Component.
 * Surfaces Human-in-the-Loop approval gate for large or ambiguous mutations.
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
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 20px; background: rgba(245, 158, 11, 0.12); border-bottom: 2px solid #f59e0b; backdrop-filter: blur(8px); color: #fef3c7; font-size: 13px;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; background: rgba(245, 158, 11, 0.25); border: 1px solid #f59e0b; color: #fbbf24; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
          Approval Required
        </span>
        <div>
          <strong style="color: #ffffff; font-weight: 600;">Proposed Layout Untangling:</strong>
          <span style="color: #fde68a; margin-left: 6px;">
            Untangle region of <strong>${nodeCount} nodes</strong> (Edge crossings: 
            <span style="color: #f87171; text-decoration: line-through;">${beforeCrossings}</span> ➔ 
            <span style="color: #34d399; font-weight: 700;">${afterCrossings}</span>).
          </span>
          <span style="display: block; font-size: 11px; color: #d97706; margin-top: 2px;">
            ${reasonText}
          </span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="proposal-approve-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; background: #10b981; color: #ffffff; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s;" aria-label="Approve & Apply Layout Mutation">
          ✓ Approve & Apply
        </button>
        <button id="proposal-discard-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; background: rgba(71, 85, 105, 0.7); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s;" aria-label="Discard Layout Proposal">
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
      try {
        await onApprove(proposal);
        banner.remove();
      } catch {
        approveBtn.disabled = false;
        approveBtn.textContent = 'Failed — Try Again';
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
