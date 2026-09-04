/**
 * Cold-Judge Fallback & Onboarding Banner Component — Premium Redesign.
 * Surfaces browser configuration instructions and video demo when WebMCP is absent.
 * Uses frosted-glass aesthetic consistent with the enterprise header.
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
    <div class="banner-content" style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding: 9px 20px;
      background: rgba(11,15,25,0.94);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      border-bottom: 1px solid rgba(99,102,241,0.2);
      font-size: 12px;
      color: #9CA3AF;
      box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
    ">
      <!-- Left: Status info -->
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <!-- Status badge -->
        <span class="status-badge" style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 5px;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.25);
          color: #818CF8;
          font-weight: 600;
          font-size: 10.5px;
          letter-spacing: 0.02em;
          white-space: nowrap;
        ">
          <span style="
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #6366F1;
            flex-shrink: 0;
          "></span>
          WebMCP Environment: Inactive (Standard Browser)
        </span>

        <!-- Instruction text -->
        <span style="color: #6B7280; font-size: 11.5px; line-height: 1.4;">
          To interact with the autonomous agent live, open this URL in the ChatGPT in-app browser or launch Chrome with
          <code style="
            background: rgba(9,13,22,0.8);
            padding: 2px 7px;
            border-radius: 4px;
            font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
            color: #A5B4FC;
            font-size: 10.5px;
            border: 1px solid rgba(99,102,241,0.2);
          ">${flagUrl}</code>.
        </span>
      </div>

      <!-- Right: CTAs -->
      <div style="display: flex; align-items: center; gap: 7px; flex-shrink: 0;">
        <button id="copy-flag-btn" style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 13px;
          border-radius: 6px;
          background: #4F46E5;
          color: #FFFFFF;
          border: none;
          font-size: 11.5px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s, box-shadow 0.15s;
          white-space: nowrap;
          box-shadow: 0 0 0 0 rgba(79,70,229,0);
        "
        onmouseover="this.style.background='#4338CA'; this.style.boxShadow='0 0 12px rgba(99,102,241,0.4)'"
        onmouseout="this.style.background='#4F46E5'; this.style.boxShadow='none'"
        aria-label="Copy Chrome Testing Flag">
          Copy Chrome Testing Flag
        </button>

        <button id="watch-demo-btn" style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 13px;
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          color: #CBD5E1;
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 11.5px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.18)'"
        onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(255,255,255,0.1)'"
        aria-label="Watch 2-Min Live Demo Video">
          Watch 2-Min Live Demo Video
        </button>

        <button id="dismiss-banner-btn" style="
          background: transparent;
          border: none;
          color: #374151;
          font-size: 16px;
          cursor: pointer;
          padding: 4px 6px;
          line-height: 1;
          border-radius: 4px;
          transition: color 0.15s;
          flex-shrink: 0;
        "
        onmouseover="this.style.color='#9CA3AF'"
        onmouseout="this.style.color='#374151'"
        aria-label="Dismiss banner">&times;</button>
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
        copyBtn.style.background = '#10B981';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Chrome Testing Flag';
          copyBtn.style.background = '#4F46E5';
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
    'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(9,13,22,0.88); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 100;';

  modal.innerHTML = `
    <div style="
      background: #0F1724;
      border: 1px solid rgba(99,102,241,0.25);
      border-radius: 14px;
      width: 90%;
      max-width: 680px;
      padding: 24px;
      box-shadow:
        0 40px 80px -12px rgba(0,0,0,0.7),
        0 0 0 0.5px rgba(255,255,255,0.04) inset;
      color: #F3F4F6;
    ">
      <!-- Modal header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
        <div>
          <h2 style="
            font-size: 16px;
            font-weight: 700;
            color: #F3F4F6;
            letter-spacing: -0.01em;
            margin-bottom: 4px;
          ">Nexus Weave — 2-Minute Architecture Walkthrough</h2>
          <p style="font-size: 11.5px; color: #6B7280;">
            Browser-native dependency graph untangler · Zero-egress · Semi-autonomous WebMCP
          </p>
        </div>
        <button id="close-modal-btn" style="
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: #9CA3AF;
          font-size: 16px;
          cursor: pointer;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s;
        "
        onmouseover="this.style.background='rgba(255,255,255,0.1)'"
        onmouseout="this.style.background='rgba(255,255,255,0.05)'"
        aria-label="Close demo modal"
        >&times;</button>
      </div>

      <!-- Video Embed -->
      <iframe
        src="https://www.youtube.com/embed/SqhjPxpT9OE?autoplay=1&rel=0"
        title="Nexus Weave Video Walkthrough"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        style="
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          margin: 12px 0;
          display: block;
          background: #000;
        "
      ></iframe>

      <!-- Fallback external link & Action button -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; flex-wrap: wrap; gap: 10px;">
        <a
          href="https://youtu.be/SqhjPxpT9OE"
          target="_blank"
          rel="noopener noreferrer"
          style="
            color: #818CF8;
            font-size: 12px;
            font-weight: 500;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: color 0.15s;
          "
          onmouseover="this.style.color='#A5B4FC'"
          onmouseout="this.style.color='#818CF8'"
        >
          ▶ Watch in 1080p60 on YouTube
        </a>

        <button id="modal-ok-btn" style="
          padding: 8px 18px;
          background: #4F46E5;
          color: #FFFFFF;
          border: none;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s;
          letter-spacing: 0.01em;
        "
        onmouseover="this.style.background='#4338CA'"
        onmouseout="this.style.background='#4F46E5'"
        >Close</button>
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
