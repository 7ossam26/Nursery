# Phase 01 — Repository, tooling, and shared contracts

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Terra**, **Medium reasoning** (closest available UI setting) before starting. Well-defined repository setup and repeatable tooling work. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Create a runnable TypeScript workspace with a real PostgreSQL development environment and reliable commands, ready for incremental modules.

## Prerequisites and context

Prerequisites: None; start in a new repository containing this planning package.

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R01, R16, U23.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [MODEL_AND_CONTEXT_GUIDE.md](../docs/MODEL_AND_CONTEXT_GUIDE.md)

## Implementation scope and checkpoints

1. Create the workspace paths from ARCHITECTURE.md, package boundaries, exact dependency pins, lockfile, Node version file, environment validation, and safe .env.example. Verify current supported compatible versions against official documentation and record them in docs/DEPENDENCIES.md; use the selected major lines unless a concrete incompatibility requires a documented adjustment.

2. Add minimal Fastify API, React/Vite app, worker entry point, and shared DTO/error conventions. Provide health and readiness endpoints, structured redacted logging, request IDs, graceful shutdown, and a database connectivity check.

3. Create migration tooling with a migration lock and a minimal installation/schema baseline. Add a disposable PostgreSQL setup for integration checks. Establish typed transaction and actor-context boundaries without creating every future domain table.

4. Create root dev/build/lint/typecheck/test:unit/test:integration/test:e2e/db:migrate/db:seed:demo commands. Empty test areas must report their initial state honestly; a passing placeholder is not feature verification.

5. Document clean setup and local start in a repository README. Preserve the planning directory structure and install AGENTS.md at the actual repository root. Initialize git only if absent; do not change existing remotes or commit unrelated work.

## Acceptance gate

- From a clean environment, dependency installation, build, lint, and typecheck run using the pinned runtime.
- A migration applies to a fresh PostgreSQL database and rerunning migration execution does not duplicate changes.
- One integration check verifies real database connectivity and transaction rollback; one browser smoke opens the app.
- API readiness fails safely when PostgreSQL is unavailable; no secrets are present in browser configuration or logs.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Business module schemas, production deployment, and product UI beyond a startup shell.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record exact commands, ports, pinned dependency versions, schema baseline, and any environmental prerequisites.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 01: Repository, tooling, and shared contracts.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_01_repository_foundation.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

