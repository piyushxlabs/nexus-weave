/**
 * In-Page Activity & Telemetry Panel Component.
 * Purely local, in-memory structured log with rich generative cards.
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

  private render(): void {
    this.container.innerHTML = `
      <div class="activity-panel-widget" style="width: 360px; max-width: calc(100vw - 32px); background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); font-family: -apple-system, BlinkMacSystemFont, sans-serif; overflow: hidden; color: #f8fafc; font-size: 13px;">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(30, 41, 59, 0.7); border-bottom: 1px solid rgba(148, 163, 184, 0.15); cursor: pointer;" id="activity-panel-toggle">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; font-size: 12px; letter-spacing: 0.02em; color: #e2e8f0;">Activity & Telemetry Log</span>
            <span style="background: rgba(99, 102, 241, 0.2); color: #818cf8; padding: 1px 6px; border-radius: 9999px; font-size: 11px; font-weight: 600;">${this.entries.length}</span>
          </div>
          <button style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer;">
            ${this.isCollapsed ? '▲' : '▼'}
          </button>
        </div>

        <!-- Body -->
        <div id="activity-panel-body" style="display: ${this.isCollapsed ? 'none' : 'block'}; max-height: 280px; overflow-y: auto; padding: 8px;">
          ${
            this.entries.length === 0
              ? '<div style="padding: 16px; text-align: center; color: #64748b; font-size: 12px;">No tool invocations yet. Ready for WebMCP calls.</div>'
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
      in_progress: '#38bdf8',
      completed: '#34d399',
      proposed: '#fbbf24',
      error: '#f87171',
    };

    const color = statusColors[entry.status];

    return `
      <div class="activity-entry" style="padding: 8px 10px; margin-bottom: 6px; background: rgba(30, 41, 59, 0.4); border-left: 3px solid ${color}; border-radius: 4px; font-size: 12px;">
        <div class="activity-entry-header" data-id="${entry.id}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
          <div>
            <span style="font-weight: 600; color: #f1f5f9;">${entry.tool_name}</span>
            <span style="font-size: 10px; color: ${color}; margin-left: 6px; text-transform: uppercase;">● ${entry.status}</span>
          </div>
          <span style="font-size: 10px; color: #64748b;">${entry.duration_ms !== undefined ? `${entry.duration_ms}ms` : ''}</span>
        </div>
        <div style="color: #cbd5e1; margin-top: 3px; line-height: 1.4;">${entry.summary}</div>
        <div id="details-${entry.id}" style="display: none; background: #090d16; padding: 6px; border-radius: 4px; font-family: monospace; font-size: 10px; color: #94a3b8; overflow-x: auto; max-height: 120px;">
          <pre style="margin: 0;">${JSON.stringify(entry.payload || entry.error || {}, null, 2)}</pre>
        </div>
      </div>
    `;
  }
}
