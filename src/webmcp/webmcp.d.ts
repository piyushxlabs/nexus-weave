/**
 * Ambient type declarations for the WebMCP Imperative API (document.modelContext & navigator.modelContext).
 * Covers tool registration, discovery, abort lifecycle, and trust annotations.
 */

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface WebMCPToolResult {
  success: boolean;
  status?: 'applied' | 'proposed' | 'error';
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export interface WebMCPExecutionContext {
  signal?: AbortSignal;
  toolCallId?: string;
}

export interface WebMCPToolDefinition {
  name: string;
  description: string;
  strict?: boolean;
  annotations?: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  execute: (args: unknown, context?: WebMCPExecutionContext) => Promise<WebMCPToolResult>;
}

export interface RegisterToolOptions {
  signal?: AbortSignal;
}

export interface ModelContext {
  registerTool(tool: WebMCPToolDefinition, options?: RegisterToolOptions): void;
  unregisterTool?(name: string): void;
  getTools(): WebMCPToolDefinition[];
}

export interface ModelContextTesting {
  getTools(): Promise<WebMCPToolDefinition[]>;
  executeTool(name: string, args: Record<string, unknown>): Promise<WebMCPToolResult>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
    modelContextTesting?: ModelContextTesting;
  }
}

export {};
