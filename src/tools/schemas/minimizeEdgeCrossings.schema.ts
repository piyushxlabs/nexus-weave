/**
 * Schema and validator for minimize_edge_crossings WebMCP tool.
 * AGENT_LOGIC_SPEC.md Section 4.
 */

import { ajv, formatAjvErrors, type SchemaValidationResult, type ToolAnnotations } from './types.js';

export const MINIMIZE_EDGE_CROSSINGS_NAME = 'minimize_edge_crossings' as const;

export interface MinimizeEdgeCrossingsInput {
  region_node_ids: string[];
  confirm_pending?: boolean;
}

export interface MinimizeEdgeCrossingsResult {
  affected_node_ids: string[];
  crossings_before: number;
  crossings_after: number;
}

export interface MinimizeEdgeCrossingsOutput {
  success: boolean;
  status?: 'applied' | 'proposed' | 'declined';
  result?: MinimizeEdgeCrossingsResult | null;
  error?: string | null;
}

export const minimizeEdgeCrossingsAnnotations: ToolAnnotations = {
  title: 'Minimize Edge Crossings',
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const minimizeEdgeCrossingsInputSchema = {
  type: 'object',
  properties: {
    region_node_ids: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Explicit list of node IDs defining the region to re-lay-out.',
    },
    confirm_pending: {
      type: 'boolean',
      default: false,
      description:
        'Set true to confirm and commit an existing pending_proposal matching this exact region. Optional, defaults to false.',
    },
  },
  required: ['region_node_ids'],
  additionalProperties: false,
} as const;

export const minimizeEdgeCrossingsMetadata = {
  name: MINIMIZE_EDGE_CROSSINGS_NAME,
  description:
    "Re-lay-out a human-designated region of unpinned nodes to reduce edge crossings. Never moves a pinned node. A full-graph or large-share request returns a proposal (status: 'proposed') for the human to see animate before it is committed; call again with confirm_pending: true on the identical region to commit it.",
  strict: true,
  annotations: minimizeEdgeCrossingsAnnotations,
  inputSchema: minimizeEdgeCrossingsInputSchema,
};

const compiledValidator = ajv.compile(minimizeEdgeCrossingsInputSchema);

export function validateMinimizeEdgeCrossingsArgs(args: unknown): SchemaValidationResult {
  const valid = compiledValidator(args);
  return {
    valid: Boolean(valid),
    errors: formatAjvErrors(compiledValidator.errors),
  };
}
