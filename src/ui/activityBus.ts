/**
 * In-Page Tool Activity Event Bus for Nexus Weave.
 * Native CustomEvents dispatched on a browser EventTarget instance.
 * INTERFACE_OBSERVABILITY_SYSTEM.md Section 2a.
 */

export type ActivityEventType =
  | 'tool-invocation-start'
  | 'tool-invocation-status'
  | 'tool-invocation-result'
  | 'state-update'
  | 'approval-required'
  | 'tool-invocation-error';

export interface ToolInvocationStartDetail {
  tool_call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface ToolInvocationStatusDetail {
  tool_call_id: string;
  status: 'in_progress' | 'proposed';
  timestamp: number;
}

export interface ToolInvocationResultDetail {
  tool_call_id: string;
  tool_name: string;
  success: true;
  status?: 'applied' | 'proposed';
  result?: Record<string, unknown> | null;
  timestamp: number;
}

export interface StateUpdateDetail {
  field: 'graph_nodes' | 'graph_edges' | 'pinned_node_ids' | 'pending_proposal';
  reducer: 'merge-by-key' | 'last-write-wins' | 'append-only';
  changed_ids?: string[];
  timestamp: number;
}

export interface ApprovalRequiredDetail {
  tool_call_id: string;
  region_node_ids: string[];
  preview: Record<string, unknown>;
  timestamp: number;
}

export interface ToolInvocationErrorDetail {
  tool_call_id: string;
  tool_name: string;
  success: false;
  error: string;
  timestamp: number;
}

export type ActivityEventDetailMap = {
  'tool-invocation-start': ToolInvocationStartDetail;
  'tool-invocation-status': ToolInvocationStatusDetail;
  'tool-invocation-result': ToolInvocationResultDetail;
  'state-update': StateUpdateDetail;
  'approval-required': ApprovalRequiredDetail;
  'tool-invocation-error': ToolInvocationErrorDetail;
};

export class ToolActivityBus extends EventTarget {
  emit<T extends ActivityEventType>(type: T, detail: ActivityEventDetailMap[T]): boolean {
    const event = new CustomEvent(type, { detail });
    return this.dispatchEvent(event);
  }

  subscribe<T extends ActivityEventType>(
    type: T,
    listener: (event: CustomEvent<ActivityEventDetailMap[T]>) => void
  ): () => void {
    const handler = (evt: Event) => listener(evt as CustomEvent<ActivityEventDetailMap[T]>);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
}

export const activityBus = new ToolActivityBus();
