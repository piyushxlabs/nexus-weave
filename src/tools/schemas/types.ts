/**
 * Shared types and Ajv compilation instance for WebMCP tool schemas.
 */

import AjvModule from 'ajv';
import type { NodeRecord, EdgeRecord, ToolResult } from '../../state/schema.js';
import type { ToolAnnotations, WebMCPToolDefinition } from '../../webmcp/webmcp.js';

// Compatible Ajv constructor for ESM
const Ajv = (AjvModule as any).default || AjvModule;

export const ajv = new Ajv({
  allErrors: true,
  strict: true,
});

export type { NodeRecord, EdgeRecord, ToolResult, ToolAnnotations, WebMCPToolDefinition };

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export const RESERVED_OBJECT_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export function formatAjvErrors(errors: any[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((e) => `${e.instancePath ? e.instancePath + ' ' : ''}${e.message || 'validation failed'}`);
}
