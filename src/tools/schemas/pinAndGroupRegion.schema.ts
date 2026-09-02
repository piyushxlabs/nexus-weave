/**
 * Schema and validator for pin_and_group_region WebMCP tool.
 * AGENT_LOGIC_SPEC.md Section 4.
 */

import { ajv, formatAjvErrors, type SchemaValidationResult, type ToolAnnotations } from './types.js';

export const PIN_AND_GROUP_REGION_NAME = 'pin_and_group_region' as const;

export interface PinAndGroupRegionInput {
  node_ids: string[];
  pinned: boolean;
}

export interface PinAndGroupRegionResult {
  [key: string]: unknown;
  updated_node_ids: string[];
  pinned: boolean;
}

export interface PinAndGroupRegionOutput {
  success: boolean;
  result?: PinAndGroupRegionResult | null;
  error?: string | null;
}

export const pinAndGroupRegionAnnotations: ToolAnnotations = {
  title: 'Pin and Group Region',
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const pinAndGroupRegionInputSchema = {
  type: 'object',
  properties: {
    node_ids: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: 'Explicit list of node IDs to pin or unpin.',
    },
    pinned: {
      type: 'boolean',
      description: 'True to pin the named nodes; false to unpin them.',
    },
  },
  required: ['node_ids', 'pinned'],
  additionalProperties: false,
} as const;

export const pinAndGroupRegionMetadata = {
  name: PIN_AND_GROUP_REGION_NAME,
  description:
    'Mark specific, explicitly named nodes/clusters as pinned (protected from future automatic layout changes) or unpinned. Only ever acts on an explicit, unambiguous list of node IDs — never infers which nodes are meant.',
  strict: true,
  annotations: pinAndGroupRegionAnnotations,
  inputSchema: pinAndGroupRegionInputSchema,
};

const compiledValidator = ajv.compile(pinAndGroupRegionInputSchema);

export function validatePinAndGroupRegionArgs(args: unknown): SchemaValidationResult {
  const valid = compiledValidator(args);
  return {
    valid: Boolean(valid),
    errors: formatAjvErrors(compiledValidator.errors),
  };
}
