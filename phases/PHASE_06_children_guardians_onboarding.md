# Phase 06 — Children, guardians, onboarding, and documents

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **Medium reasoning** (closest available UI setting) before starting. A substantial but clearly specified workflow can reuse established forms and authorization. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Let nursery staff onboard families and maintain child records without duplicated children, accounts, or history.

## Prerequisites and context

Prerequisites: [Phase 05](../phases/PHASE_05_superadmin_licensing_settings.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R05, U08.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [PRODUCT_REQUIREMENTS.md](../docs/PRODUCT_REQUIREMENTS.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [DECISIONS.md](../docs/DECISIONS.md)

## Implementation scope and checkpoints

1. Implement children, contacts, guardian-child links with allowed data permissions, classroom history, and lifecycle history. Support two guardians for one child and multiple children for one guardian.

2. Build guided onboarding for required account/contact/child/branch/classroom fields, using the quota provisioning service in a transaction. Existing parents can be linked without creating another seat or child ledger.

3. Implement Active/Paused/Archived states, nursery-contact messages, classroom moves, search, and scoped child detail pages. A paused child does not block an active sibling or automatically change fee agreements.

4. Implement generic named private administrative documents with optional expiry, validated content/size, safe storage names, and authorized download. Handle database rollback or abandoned upload cleanup without orphaned public files.

5. Add the explicit finance/transport onboarding integration boundary for later phases; show only currently enabled and implemented steps. Cross-branch transfer with financial history is not available until the transfer service is complete.

6. Keep guardians' views limited to their linked children and permissions. Duplicate checks must not reveal inaccessible family records.

## Acceptance gate

- A03: multiple guardian accounts read one child's shared record; a guardian can switch between permitted children.
- A04: onboarding that exceeds quota leaves no partial account/child/link state.
- A01/A37: guessed child/file IDs, path traversal, invalid file types, and links to inaccessible children fail.
- Pause/archive/classroom move retain history and show the correct sibling and staff views.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Tuition calculation/collection implementation, advanced admissions CRM, predefined document checklists, and daily photo sharing.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record onboarding contract, required fields, document limits, lifecycle behavior, and finance hooks for Phases 14–15.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 06: Children, guardians, onboarding, and documents.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_06_children_guardians_onboarding.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

