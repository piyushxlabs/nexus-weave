/**
 * In-Memory Activity & Observability Log for Nexus Weave.
 * Implements OpenTelemetry GenAI Semantic Conventions (`gen_ai.*`, `execute_tool`).
 * INTERFACE_OBSERVABILITY_SYSTEM.md Section 6.
 *
 * ABSOLUTE CONSTITUTIONAL INVARIANT:
 * This module is 100% in-memory and ephemeral.
 * ZERO fetch, XMLHttpRequest, WebSocket, or navigator.sendBeacon calls EVER.
 */

export interface ActivityLogSpan {
  'gen_ai.operation.name': 'execute_tool';
  'tool.name': string;
  'tool.call_id': string;
  status: 'queued' | 'in_progress' | 'completed' | 'error' | 'canceled' | 'proposed';
  timestamp_start: number;
  timestamp_end?: number;
  duration_ms?: number;
  args?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export class InMemoryActivityLogger {
  private spans: ActivityLogSpan[] = [];
  private readonly maxSpans: number;

  constructor(maxSpans: number = 100) {
    this.maxSpans = maxSpans;
  }

  /**
   * Records the start of a tool execution span.
   */
  public recordStart(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    timestamp: number = Date.now()
  ): void {
    const span: ActivityLogSpan = {
      'gen_ai.operation.name': 'execute_tool',
      'tool.name': toolName,
      'tool.call_id': toolCallId,
      status: 'in_progress',
      timestamp_start: timestamp,
      args,
    };

    this.spans.unshift(span);
    if (this.spans.length > this.maxSpans) {
      this.spans.pop();
    }
  }

  /**
   * Updates the intermediate status of a tool invocation (e.g. proposed).
   */
  public recordStatus(
    toolCallId: string,
    status: 'in_progress' | 'proposed'
  ): void {
    const span = this.spans.find((s) => s['tool.call_id'] === toolCallId);
    if (span) {
      span.status = status;
    }
  }

  /**
   * Records a successful tool completion or proposal result.
   */
  public recordResult(
    toolCallId: string,
    toolName: string,
    result: Record<string, unknown> | null,
    status?: string,
    timestamp: number = Date.now()
  ): void {
    const span = this.spans.find((s) => s['tool.call_id'] === toolCallId);
    const resolvedStatus = status === 'proposed' ? 'proposed' : 'completed';

    if (span) {
      span.status = resolvedStatus;
      span.timestamp_end = timestamp;
      span.duration_ms = timestamp - span.timestamp_start;
      span.result = result;
    } else {
      this.spans.unshift({
        'gen_ai.operation.name': 'execute_tool',
        'tool.name': toolName,
        'tool.call_id': toolCallId,
        status: resolvedStatus,
        timestamp_start: timestamp,
        timestamp_end: timestamp,
        duration_ms: 0,
        result,
      });
      if (this.spans.length > this.maxSpans) {
        this.spans.pop();
      }
    }
  }

  /**
   * Records a tool failure span.
   */
  public recordError(
    toolCallId: string,
    toolName: string,
    error: string,
    timestamp: number = Date.now()
  ): void {
    const span = this.spans.find((s) => s['tool.call_id'] === toolCallId);

    if (span) {
      span.status = 'error';
      span.timestamp_end = timestamp;
      span.duration_ms = timestamp - span.timestamp_start;
      span.error = error;
    } else {
      this.spans.unshift({
        'gen_ai.operation.name': 'execute_tool',
        'tool.name': toolName,
        'tool.call_id': toolCallId,
        status: 'error',
        timestamp_start: timestamp,
        timestamp_end: timestamp,
        duration_ms: 0,
        error,
      });
      if (this.spans.length > this.maxSpans) {
        this.spans.pop();
      }
    }
  }

  /**
   * Returns a read-only list of in-memory telemetry spans.
   */
  public getSpans(): readonly ActivityLogSpan[] {
    return this.spans;
  }

  /**
   * Clears the in-memory span buffer.
   */
  public clear(): void {
    this.spans = [];
  }
}

export const activityLogger = new InMemoryActivityLogger();
