/**
 * Cold-Judge Fallback & Onboarding Banner Component.
 * Surfaces browser configuration instructions and video demo when WebMCP is absent.
 * INTERFACE_OBSERVABILITY_SYSTEM.md Section 4a (unsupportedBanner.ts).
 */

export const CHROME_TESTING_FLAG = 'chrome://flags/#enable-webmcp-testing';

export interface UnsupportedBannerOptions {
  onDismiss?: () => void;
  flagUrl?: string;
}

/**
 * Renders the cold-judge fallback banner into the target container.
 */
export function renderUnsupportedBanner(
  container: HTMLElement,
  options: UnsupportedBannerOptions = {}
): HTMLElement {
  const { onDismiss, flagUrl = CHROME_TESTING_FLAG } = options;

  const banner = document.createElement('div');
  banner.id = 'unsupported-browser-banner';
  banner.className = 'unsupported-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  banner.innerHTML = `
    <div class="banner-content" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 10px 16px; background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(99, 102, 241, 0.3); font-size: 13px; color: #e2e8f0;">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <span class="status-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 9999px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.4); color: #818cf8; font-weight: 600; font-size: 11px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #818cf8;"></span>
          WebMCP Environment: Inactive (Standard Browser)
        </span>
        <span style="color: #cbd5e1;">
          To interact with the autonomous agent live, open this URL in the ChatGPT in-app browser or launch Chrome with
          <code style="background: rgba(15, 23, 42, 0.7); padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #a5b4fc; border: 1px solid rgba(148, 163, 184, 0.2);">${flagUrl}</code>.
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="copy-flag-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 6px; background: #4f46e5; color: #ffffff; border: none; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.2s;" aria-label="Copy Chrome Testing Flag">
          <span>Copy Chrome Testing Flag</span>
        </button>
        <button id="watch-demo-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 6px; background: rgba(51, 65, 85, 0.8); color: #f1f5f9; border: 1px solid rgba(148, 163, 184, 0.2); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s;" aria-label="Watch 2-Min Live Demo Video">
          <span>Watch 2-Min Live Demo Video</span>
        </button>
        <button id="dismiss-banner-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px; line-height: 1;" aria-label="Dismiss banner">&times;</button>
      </div>
    </div>
  `;

  // Copy Flag Handler
  const copyBtn = banner.querySelector('#copy-flag-btn') as HTMLButtonElement;
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(flagUrl);
        }
        copyBtn.textContent = 'Copied to Clipboard!';
        copyBtn.style.background = '#10b981';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Chrome Testing Flag';
          copyBtn.style.background = '#4f46e5';
        }, 2000);
      } catch {
        copyBtn.textContent = 'Flag: ' + flagUrl;
      }
    });
  }

  // Watch Demo Handler
  const demoBtn = banner.querySelector('#watch-demo-btn') as HTMLButtonElement;
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      openDemoModal();
    });
  }

  // Dismiss Handler
  const dismissBtn = banner.querySelector('#dismiss-banner-btn') as HTMLButtonElement;
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      banner.remove();
      onDismiss?.();
    });
  }

  container.appendChild(banner);
  return banner;
}

/**
 * Opens a non-blocking interactive demonstration modal showcasing autonomous untangling.
 */
export function openDemoModal(): HTMLElement {
  const existing = document.getElementById('nexus-demo-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'nexus-demo-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Nexus Weave WebMCP Demo');
  modal.style.cssText =
    'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 100;';

  modal.innerHTML = `
    <div style="background: #1e293b; border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 12px; width: 90%; max-width: 640px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); color: #f8fafc;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="font-size: 18px; font-weight: 600; color: #e2e8f0;">Nexus Weave — 2-Minute WebMCP Walkthrough</h2>
        <button id="close-modal-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 20px; cursor: pointer;">&times;</button>
      </div>
      <div style="background: #0f172a; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px; border: 1px dashed rgba(148, 163, 184, 0.3);">
        <div style="font-size: 36px; margin-bottom: 8px;">🕸️ ➔ ⚡ ➔ ✨</div>
        <p style="font-size: 14px; color: #94a3b8; line-height: 1.6;">
          Nexus Weave turns the active browser tab into a high-performance WebMCP graph server. External AI agents query topology, identify cyclic deadlocks, compute critical paths, and untangle tangled layout regions in real time without sending data outside this tab.
        </p>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button id="modal-ok-btn" style="padding: 8px 16px; background: #4f46e5; color: #ffffff; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">Got It</button>
      </div>
    </div>
  `;

  const closeModal = () => modal.remove();
  modal.querySelector('#close-modal-btn')?.addEventListener('click', closeModal);
  modal.querySelector('#modal-ok-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.body.appendChild(modal);
  return modal;
}
