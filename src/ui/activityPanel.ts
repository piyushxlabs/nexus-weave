/**
 * In-Page Activity & Telemetry Panel Component — Enterprise IDE Dock Redesign.
 * Glassmorphism drawer with dark terminal aesthetic, monospace timestamps,
 * color-coded event tags, and hover effects.
 * INTERFACE_OBSERVABILITY_SYSTEM.md Section 2 / Section 4a / Section 6.
 */

import { activityBus, type ActivityEventDetailMap } from './activityBus.js';

export interface ActivityLogEntry {
  id: string;
  tool_name: string;
  status: 'in_progress' | 'completed' | 'proposed' | 'error';
  summary: string;
  timestamp: number;
  duration_ms?: number;
  payload?: unknown;
  error?: string | null;
}

export class ActivityPanel {
  private container: HTMLElement;
  private entries: ActivityLogEntry[] = [];
  private isCollapsed: boolean = false;
  private unsubscribeFns: Array<() => void> = [];
  private activeStartTime: Map<string, number> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
    this.setupListeners();
  }

  public getEntries(): readonly ActivityLogEntry[] {
    return this.entries;
  }

  public clear(): void {
    this.entries = [];
    this.render();
  }

  public destroy(): void {
    for (const unsub of this.unsubscribeFns) {
      unsub();
    }
    this.unsubscribeFns = [];
    this.container.innerHTML = '';
  }

  private setupListeners(): void {
    // 1. Tool Invocation Start
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-start', (e) => {
        const { tool_call_id, tool_name, timestamp } = e.detail;
        this.activeStartTime.set(tool_call_id, timestamp);

        this.addEntry({
          id: tool_call_id,
          tool_name,
          status: 'in_progress',
          summary: `Executing ${tool_name}…`,
          timestamp,
        });
      })
    );

    // 2. Tool Invocation Status
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-status', (e) => {
        const { tool_call_id, status } = e.detail;
        const entry = this.entries.find((it) => it.id === tool_call_id);
        if (entry && status === 'proposed') {
          entry.status = 'proposed';
          entry.summary = 'Layout proposal ready for review (Approval-Gate)';
          this.render();
        }
      })
    );

    // 3. Tool Invocation Result
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-result', (e) => {
        const { tool_call_id, tool_name, status, result, timestamp } = e.detail;
        const startTime = this.activeStartTime.get(tool_call_id) ?? timestamp;
        const duration_ms = timestamp - startTime;

        const summary = this.formatResultSummary(tool_name, result, status);
        const existingIdx = this.entries.findIndex((it) => it.id === tool_call_id);

        const entry: ActivityLogEntry = {
          id: tool_call_id,
          tool_name,
          status: status === 'proposed' ? 'proposed' : 'completed',
          summary,
          timestamp,
          duration_ms,
          payload: result,
        };

        if (existingIdx >= 0) {
          this.entries[existingIdx] = entry;
        } else {
          this.entries.unshift(entry);
        }
        this.render();
      })
    );

    // 4. Tool Invocation Error
    this.unsubscribeFns.push(
      activityBus.subscribe('tool-invocation-error', (e) => {
        const { tool_call_id, tool_name, error, timestamp } = e.detail;
        const startTime = this.activeStartTime.get(tool_call_id) ?? timestamp;
        const duration_ms = timestamp - startTime;

        const existingIdx = this.entries.findIndex((it) => it.id === tool_call_id);
        const entry: ActivityLogEntry = {
          id: tool_call_id,
          tool_name,
          status: 'error',
          summary: `Failed: ${error}`,
          timestamp,
          duration_ms,
          error,
        };

        if (existingIdx >= 0) {
          this.entries[existingIdx] = entry;
        } else {
          this.entries.unshift(entry);
        }
        this.render();
      })
    );
  }

  private addEntry(entry: ActivityLogEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > 50) {
      this.entries.pop();
    }
    this.render();
  }

  private formatResultSummary(
    toolName: string,
    result: Record<string, unknown> | null | undefined,
    status?: string
  ): string {
    if (!result) return 'Completed.';

    switch (toolName) {
      case 'get_graph_topology': {
        const nodes = result.nodes ? Object.keys(result.nodes).length : 0;
        const edges = result.edges ? Object.keys(result.edges).length : 0;
        return `Read topology — ${nodes} nodes, ${edges} edges`;
      }
      case 'detect_cycles_and_bottlenecks': {
        const cyclicCount = Array.isArray(result.cyclic_edge_ids) ? result.cyclic_edge_ids.length : 0;
        const bottleneckCount = Array.isArray(result.bottleneck_nodes) ? result.bottleneck_nodes.length : 0;
        return `Found ${cyclicCount} cyclic edges, ${bottleneckCount} bottleneck nodes`;
      }
      case 'compute_critical_path': {
        const path = Array.isArray(result.critical_path_node_ids) ? result.critical_path_node_ids : [];
        const dur = typeof result.total_duration === 'number' ? result.total_duration : 0;
        return `Critical path: ${path.slice(0, 3).join(' → ')}${path.length > 3 ? '…' : ''} (${dur}ms)`;
      }
      case 'minimize_edge_crossings': {
        if (status === 'proposed') {
          return `Proposed untangling (${result.crossings_before} ➔ ${result.crossings_after} crossings)`;
        }
        return `Untangled region: ${result.crossings_before} ➔ ${result.crossings_after} crossings`;
      }
      case 'pin_and_group_region': {
        const updated = Array.isArray(result.updated_node_ids) ? result.updated_node_ids.length : 0;
        const pinned = result.pinned === true;
        return `${pinned ? 'Pinned' : 'Unpinned'} ${updated} nodes`;
      }
      default:
        return 'Execution finished.';
    }
  }

  /** Format a timestamp as HH:MM:SS.mmm */
  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  }

  /** Map tool name + status → colored event tag string */
  private getEventTag(entry: ActivityLogEntry): { tag: string; color: string; bg: string } {
    if (entry.status === 'error') {
      return { tag: '[ERROR]', color: '#FCA5A5', bg: 'rgba(239,68,68,0.15)' };
    }
    if (entry.status === 'proposed') {
      return { tag: '[APPROVAL_REQ]', color: '#FCD34D', bg: 'rgba(245,158,11,0.15)' };
    }
    if (entry.status === 'in_progress') {
      return { tag: '[TOOL_INVOKE]', color: '#93C5FD', bg: 'rgba(59,130,246,0.15)' };
    }
    // completed
    const mutatingTools = ['minimize_edge_crossings', 'pin_and_group_region'];
    if (mutatingTools.includes(entry.tool_name)) {
      return { tag: '[MUTATION]', color: '#6EE7B7', bg: 'rgba(16,185,129,0.15)' };
    }
    return { tag: '[RESULT]', color: '#A5B4FC', bg: 'rgba(99,102,241,0.12)' };
  }

  private render(): void {
    const countBadge = this.entries.length > 0
      ? `<span style="
          background: rgba(99,102,241,0.2);
          color: #818CF8;
          padding: 1px 7px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.02em;
          font-variant-numeric: tabular-nums;
        ">${this.entries.length}</span>`
      : `<span style="
          background: rgba(75,85,99,0.2);
          color: #4B5563;
          padding: 1px 7px;
          border-radius: 9999px;
          font-size: 10px;
          font-weight: 600;
        ">0</span>`;

    this.container.innerHTML = `
      <div class="activity-panel-widget" style="
        width: 380px;
        max-width: calc(100vw - 40px);
        background: rgba(13,17,23,0.96);
        backdrop-filter: blur(20px) saturate(150%);
        -webkit-backdrop-filter: blur(20px) saturate(150%);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        box-shadow:
          0 20px 40px rgba(0,0,0,0.6),
          0 0 0 0.5px rgba(255,255,255,0.04) inset,
          0 1px 0 rgba(255,255,255,0.06) inset;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        color: #E2E8F0;
        font-size: 12px;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          cursor: pointer;
          user-select: none;
        " id="activity-panel-toggle">
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- Terminal icon -->
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="opacity:0.6; flex-shrink:0;">
              <rect x="0.5" y="0.5" width="13" height="13" rx="2.5" stroke="rgba(148,163,184,0.5)" stroke-width="1"/>
              <path d="M3 5l2.5 2L3 9" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="7" y1="9" x2="11" y2="9" stroke="#94A3B8" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span style="font-weight: 600; font-size: 11.5px; letter-spacing: 0.015em; color: #CBD5E1;">
              Activity &amp; Telemetry Log
            </span>
            ${countBadge}
          </div>
          <button style="
            background: transparent;
            border: none;
            color: #4B5563;
            font-size: 11px;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 4px;
            transition: color 0.15s;
            line-height: 1;
          " aria-label="${this.isCollapsed ? 'Expand panel' : 'Collapse panel'}">
            ${this.isCollapsed ? '▲' : '▼'}
          </button>
        </div>

        <!-- Body -->
        <div id="activity-panel-body" style="
          display: ${this.isCollapsed ? 'none' : 'block'};
          max-height: 300px;
          overflow-y: auto;
        ">
          ${
            this.entries.length === 0
              ? `<div style="
                  padding: 20px 16px;
                  text-align: center;
                  color: #374151;
                  font-size: 11px;
                  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
                  line-height: 1.6;
                ">
                  <div style="font-size: 16px; margin-bottom: 6px; opacity: 0.4;">◈</div>
                  No tool invocations yet. Ready for WebMCP calls.
                </div>`
              : this.entries.map((entry) => this.renderEntry(entry)).join('')
          }
        </div>
      </div>
    `;

    // Bind collapse toggle
    const toggle = this.container.querySelector('#activity-panel-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        this.isCollapsed = !this.isCollapsed;
        this.render();
      });
    }

    // Bind entry expansion clicks
    const entryEls = this.container.querySelectorAll('.activity-entry-header');
    entryEls.forEach((header) => {
      header.addEventListener('click', () => {
        const id = header.getAttribute('data-id');
        const detailsEl = this.container.querySelector(`#details-${id}`);
        if (detailsEl) {
          const isHidden = detailsEl.getAttribute('style')?.includes('display: none');
          detailsEl.setAttribute('style', isHidden ? 'display: block; margin-top: 6px;' : 'display: none;');
        }
      });
    });
  }

  private renderEntry(entry: ActivityLogEntry): string {
    const statusColors = {
      in_progress: '#38BDF8',
      completed:   '#34D399',
      proposed:    '#FBBF24',
      error:       '#F87171',
    };

    const accentColor = statusColors[entry.status];
    const ts = this.formatTimestamp(entry.timestamp);
    const { tag, color, bg } = this.getEventTag(entry);

    return `
      <div class="activity-entry" style="
        padding: 9px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        border-left: 2px solid ${accentColor};
        transition: background 0.12s;
      "
      onmouseover="this.style.background='rgba(255,255,255,0.03)'"
      onmouseout="this.style.background='transparent'"
      >
        <!-- Row 1: tag + tool name + duration -->
        <div class="activity-entry-header" data-id="${entry.id}" style="
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          margin-bottom: 3px;
        ">
          <!-- Monospace timestamp -->
          <span style="
            font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
            font-size: 9.5px;
            color: #374151;
            letter-spacing: -0.01em;
            flex-shrink: 0;
          ">${ts}</span>

          <!-- Event tag -->
          <span style="
            font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.02em;
            color: ${color};
            background: ${bg};
            padding: 1px 5px;
            border-radius: 3px;
            flex-shrink: 0;
          ">${tag}</span>

          <!-- Tool name -->
          <span style="
            font-weight: 600;
            font-size: 11px;
            color: #E2E8F0;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">${entry.tool_name}</span>

          <!-- Duration -->
          ${entry.duration_ms !== undefined
            ? `<span style="
                font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
                font-size: 9.5px;
                color: #374151;
                flex-shrink: 0;
              ">${entry.duration_ms}ms</span>`
            : ''}
        </div>

        <!-- Row 2: summary text -->
        <div style="
          color: #6B7280;
          font-size: 10.5px;
          line-height: 1.4;
          padding-left: 0;
        ">${entry.summary}</div>

        <!-- Expandable JSON payload -->
        <div id="details-${entry.id}" style="display: none; margin-top: 6px;">
          <pre style="
            margin: 0;
            padding: 8px;
            background: rgba(9,13,22,0.9);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 6px;
            font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
            font-size: 9.5px;
            color: #6B7280;
            overflow-x: auto;
            max-height: 120px;
            line-height: 1.5;
          ">${JSON.stringify(entry.payload || entry.error || {}, null, 2)}</pre>
        </div>
      </div>
    `;
  }
}
