# Phase 04 — Branches, classrooms, and dynamic permissions

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Correct branch and classroom isolation must hold across arbitrary role combinations. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Implement configurable roles and precise branch/classroom access with server enforcement.

## Prerequisites and context

Prerequisites: [Phase 03](../phases/PHASE_03_authentication_sessions.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R02, R03, R05, U02.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Create coded branches, classrooms, age groups, capacity settings, role/capability catalogs, account roles, branch assignments, and teacher classroom assignments. Seed editable role templates using stable capability keys.

2. Implement the central policy layer for capability, assigned branches, assigned classrooms, sensitive grants, and future guardian links. Deny unassigned access; role display names must never authorize actions.

3. Build organization and assignment screens with multi-select branches/classrooms. Moving a teacher changes current scope without rewriting old audit ownership. Capacity warnings do not silently reject an authorized placement.

4. Build Superadmin role-definition tools and nursery-admin assignment tools constrained by delegated assignable roles. Admins cannot create an escalation path or grant sensitive-edit entitlement controlled by Superadmin.

5. Add explicit policy helpers for lists, aggregate queries, individual records, later files/exports, and support access. Apply branch-switch UI only to scopes granted by the API.

## Acceptance gate

- A01 and A02: list/detail/mutation attempts across branches and unassigned classrooms are denied or correctly filtered.
- Try assigning a classroom from a branch the user cannot access; the server rejects the inconsistent assignment.
- Renaming a role preserves permissions; adding an unauthorized capability or assigning a privileged role is rejected.
- Scope changes take effect for an existing session; multi-branch managers see only the union of assigned branches.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Parent-child scope implementation, financial sensitive actions, and a central multi-customer control plane.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record capability naming, delegated role rules, query-scope helpers, and the permission fixtures used.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 04: Branches, classrooms, and dynamic permissions.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_04_branches_roles_scopes.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

