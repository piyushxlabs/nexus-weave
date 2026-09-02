/**
 * Authoritative typed state schema for Nexus Weave.
 * In-memory, ephemeral state model per AGENT_ORCHESTRATION_BLUEPRINT.md Section 3.
 */

export interface NodeRecord {
  readonly id: string;
  readonly label: string;
  x: number;
  y: number;
  pinned: boolean;
  duration?: number | null;
}

export interface EdgeRecord {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string;
  is_cyclic?: boolean | null;
  is_critical?: boolean | null;
}

export interface ToolInvocationRecord {
  tool_call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface ToolResult {
  tool_call_id: string;
  tool_name: string;
  success: boolean;
  status?: 'applied' | 'proposed' | 'error';
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export interface ProposedMutation {
  tool_call_id: string;
  tool_name: string;
  region_node_ids: string[];
  candidate_positions: Record<string, { x: number; y: number }>;
  initial_crossings?: number;
  candidate_crossings?: number;
  status: 'proposed';
}

export interface ErrorRecord {
  tool_call_id?: string;
  tool_name?: string;
  error: string;
  timestamp: number;
}

export interface RuntimeConfig {
  readonly webmcp_supported: boolean;
  readonly duration_field: string;
  readonly large_mutation_share_threshold: number;
  readonly max_layout_iterations: number;
}

export interface GraphAgentState {
  graph_nodes: Record<string, NodeRecord>;
  graph_edges: Record<string, EdgeRecord>;
  pinned_node_ids: Set<string>;
  last_tool_invocation: ToolInvocationRecord | null;
  invocation_log: ToolInvocationRecord[];
  tool_artifacts: Record<string, ToolResult>;
  pending_proposal: ProposedMutation | null;
  error_logs: ErrorRecord[];
  config: Readonly<RuntimeConfig>;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  webmcp_supported: false,
  duration_field: 'duration',
  large_mutation_share_threshold: 0.35,
  max_layout_iterations: 100,
};

export function createInitialState(customConfig?: Partial<RuntimeConfig>): GraphAgentState {
  return {
    graph_nodes: {},
    graph_edges: {},
    pinned_node_ids: new Set<string>(),
    last_tool_invocation: null,
    invocation_log: [],
    tool_artifacts: {},
    pending_proposal: null,
    error_logs: [],
    config: Object.freeze({
      ...DEFAULT_CONFIG,
      ...customConfig,
    }),
  };
}
