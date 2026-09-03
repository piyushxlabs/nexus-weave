/**
 * Schema and validator for detect_cycles_and_bottlenecks WebMCP tool.
 * AGENT_LOGIC_SPEC.md Section 4.
 */

import { ajv, formatAjvErrors, type SchemaValidationResult, type ToolAnnotations } from './types.js';

export const DETECT_CYCLES_AND_BOTTLENECKS_NAME = 'detect_cycles_and_bottlenecks' as const;

export type DetectCyclesAndBottlenecksInput = Record<string, never>;

export interface BottleneckNode {
  node_id: string;
  centrality_score: number;
}

export interface DetectCyclesAndBottlenecksResult {
  [key: string]: unknown;
  cyclic_edge_ids: string[];
  bottleneck_nodes: BottleneckNode[];
}

export interface DetectCyclesAndBottlenecksOutput {
  success: boolean;
  result?: DetectCyclesAndBottlenecksResult | null;
  error?: string | null;
}

export const detectCyclesAndBottlenecksAnnotations: ToolAnnotations = {
  title: 'Detect Cycles and Bottlenecks',
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const detectCyclesAndBottlenecksInputSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const detectCyclesAndBottlenecksMetadata = {
  name: DETECT_CYCLES_AND_BOTTLENECKS_NAME,
  description:
    "Deterministic detection of circular dependency deadlocks (using Tarjan's SCC) and bottleneck nodes in the microservice topology. Call this whenever the user asks about deadlocks, cycles, loops, or bottlenecks.",
  strict: true,
  annotations: detectCyclesAndBottlenecksAnnotations,
  inputSchema: detectCyclesAndBottlenecksInputSchema,
};

const compiledValidator = ajv.compile(detectCyclesAndBottlenecksInputSchema);

export function validateDetectCyclesAndBottlenecksArgs(args: unknown): SchemaValidationResult {
  const valid = compiledValidator(args);
  return {
    valid: Boolean(valid),
    errors: formatAjvErrors(compiledValidator.errors),
  };
}
