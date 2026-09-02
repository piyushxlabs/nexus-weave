/**
 * Schema and validator for compute_critical_path WebMCP tool.
 * AGENT_LOGIC_SPEC.md Section 4.
 */

import { ajv, formatAjvErrors, RESERVED_OBJECT_KEYS, type SchemaValidationResult, type ToolAnnotations } from './types.js';

export const COMPUTE_CRITICAL_PATH_NAME = 'compute_critical_path' as const;

export interface ComputeCriticalPathInput {
  duration_field: string;
}

export interface ComputeCriticalPathResult {
  critical_path_node_ids: string[];
  total_duration: number;
}

export interface ComputeCriticalPathOutput {
  success: boolean;
  result?: ComputeCriticalPathResult | null;
  error?: string | null;
}

export const computeCriticalPathAnnotations: ToolAnnotations = {
  title: 'Compute Critical Path',
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const computeCriticalPathInputSchema = {
  type: 'object',
  properties: {
    duration_field: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      description: 'Name of the field on each node holding its duration value.',
    },
  },
  required: ['duration_field'],
  additionalProperties: false,
} as const;

export const computeCriticalPathMetadata = {
  name: COMPUTE_CRITICAL_PATH_NAME,
  description:
    'Compute and highlight the critical path given a duration field already present on nodes. Fails explicitly (never guesses) if no node has the named field, or if the duration-bearing subgraph is not acyclic.',
  strict: true,
  annotations: computeCriticalPathAnnotations,
  inputSchema: computeCriticalPathInputSchema,
};

const compiledValidator = ajv.compile(computeCriticalPathInputSchema);

export function validateComputeCriticalPathArgs(args: unknown): SchemaValidationResult {
  const valid = compiledValidator(args);
  const errors = formatAjvErrors(compiledValidator.errors);

  // Prototype-pollution guard
  if (
    valid &&
    args &&
    typeof args === 'object' &&
    'duration_field' in args &&
    typeof (args as any).duration_field === 'string'
  ) {
    const field = (args as any).duration_field;
    if (RESERVED_OBJECT_KEYS.has(field)) {
      return {
        valid: false,
        errors: [`duration_field '${field}' is a prohibited reserved JavaScript property`],
      };
    }
  }

  return {
    valid: Boolean(valid) && errors.length === 0,
    errors,
  };
}
