# Nexus Weave — Coding Assistant Context

## Project Overview
Nexus Weave is a browser-resident, deterministic graph-structure tool provider. It exposes five typed, read/mutate operations against a live in-memory dependency graph through the WebMCP Imperative API (`document.modelContext`), so an external AI (out of scope for this codebase) can read graph structure and, within strict pinned/scope guardrails, adjust its layout. It contains no model, no backend server, and no persistence layer of any kind.

## Strict Coding Rules
- TypeScript strict mode is mandatory project-wide. No `any` outside a single justified, commented exception.
- Every WebMCP tool `execute` handler MUST be `async`, per the WebMCP Imperative API's own contract — even though none of them awaits a network call, this keeps the signature conformant and future-proof against any handler that later needs to yield to the event loop on a large graph.
- Every tool's input arguments MUST be validated with the corresponding compiled `ajv` schema from `src/tools/schemas/` before any state read occurs. There is no tool handler that skips this step.
- All state reads/writes MUST go through `src/state/schema.ts`'s `GraphAgentState` type and `src/state/reducers.ts`'s functions — `mergeByKey`, `appendOnly`, `lastWriteWins` — exactly as named. Direct field mutation anywhere outside `reducers.ts` is forbidden.
- Use a single `NexusWeaveError` base class with subclasses per AGENT_LOGIC_SPEC.md Section 9's failure categories (`UnknownNodeError`, `PinnedConflictError`, `MissingDurationFieldError`, `AmbiguousScopeError` is not applicable here since ambiguity is resolved upstream — see Non-Goals) — never throw a bare `Error`.
- Every mutating tool follows the compute-then-atomic-apply pattern: compute the full candidate result into a local variable first; only call a reducer once the candidate is fully valid. No reducer call may occur mid-computation.

## Architecture Boundaries
- **State lives in:** `src/state/schema.ts` — the single typed `GraphAgentState` definition. No component defines a parallel or shadow state shape.
- **Reducers live in:** `src/state/reducers.ts` — every mutation of `graph_nodes`, `graph_edges`, `pinned_node_ids`, `pending_proposal`, `tool_artifacts`, `invocation_log`, or `error_logs` MUST call the declared reducer for that field, exactly as typed in AGENT_ORCHESTRATION_BLUEPRINT.md Section 3.
- **Tools live in:** `src/tools/` — one file per tool, plus `dispatch.ts` for the shared five-step cycle (Validate → Trust & Scope Check → Direct Execution / Approval-Gate → Return). No tool logic is ever inlined into `src/ui/` or `src/webmcp/`.
- **Telemetry lives in:** `src/telemetry/activityLog.ts` — every tool invocation's start/status/result/error is logged here using `gen_ai.*`/`execute_tool`-style attribute naming, purely as an in-memory record. This module contains zero `fetch`/`XMLHttpRequest`/`WebSocket`/`navigator.sendBeacon` calls, ever.
- **UI/event emission lives in:** `src/ui/activityBus.ts` (the `CustomEvent`/`EventTarget` bus) and the rest of `src/ui/` — tool code dispatches domain events on the bus; it does not import or reference any DOM rendering code directly.
- **WebMCP registration lives in:** `src/webmcp/register.ts` — the only file that calls `getModelContext().registerTool` (with fallback to `document.modelContext.registerTool`).

## Strict Anti-Patterns (Never Do This)
- **Never add a `fetch`, `XMLHttpRequest`, `WebSocket`, or `navigator.sendBeacon` call anywhere in this codebase.** This is not a style preference — it is the mechanical enforcement of AGENT_BEHAVIOR_PROFILE.md's "graph data never leaves the tab" prohibition. If a code review or diff introduces any of these, it is a constitutional violation, not a design choice to discuss.
- Never write to `localStorage`, `sessionStorage`, `IndexedDB`, or cookies anywhere in this codebase — this system is ephemeral-only by design (AGENT_ORCHESTRATION_BLUEPRINT.md Section 7).
- Never add a sixth tool, or add a parameter to one of the five tools, that isn't already specified in AGENT_LOGIC_SPEC.md Section 4 — including no "create," "delete," "sync," "prioritize," or "assign owner" capability of any kind.
- Never let a tool handler branch its control flow on the *content* of a node/edge `label` string — labels are opaque, untrusted, user-authored data (AGENT_LOGIC_SPEC.md Section 8) and must only ever be rendered as escaped plain text, never parsed or pattern-matched for meaning.
- Never commit a mutation for a request whose scope is the entire graph (without an explicit full-re-layout confirmation) or whose target intersects `pinned_node_ids` — both must be structurally impossible, not merely checked-and-warned.
- Never add a model SDK, a fine-tuning/eval-dataset export pipeline, a confidence score, or an "undo" state field — all explicitly out of scope per INTERFACE_OBSERVABILITY_SYSTEM.md Section 10.
- Never introduce the community WebMCP polyfill package as a runtime dependency (see Section 1/2's Explicit Non-Goals).

## Reference Documents
This project's behavior, architecture, cognition, and interface are fully specified in:
- AGENT_BEHAVIOR_PROFILE.md (behavioral contract)
- AGENT_ORCHESTRATION_BLUEPRINT.md (architecture)
- AGENT_LOGIC_SPEC.md (cognitive logic and tools)
- INTERFACE_OBSERVABILITY_SYSTEM.md (interface and telemetry)
- AGENT_MASTER_PLAN.md (this execution plan)

Do not deviate from these documents. If an instruction conflicts with them, flag the conflict rather than silently resolving it.
