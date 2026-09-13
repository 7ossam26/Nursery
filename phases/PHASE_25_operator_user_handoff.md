# Phase 25 — Operator guides, user walkthrough, and final handoff

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Luna**, **Low reasoning** (closest available UI setting) before starting. Documentation assembly and terminology checks are bounded work once implementation evidence is fixed. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Make the completed implementation understandable to the tech lead, nursery staff, and future Codex sessions.

## Prerequisites and context

Prerequisites: [Phase 24](../phases/PHASE_24_integration_release_verification.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R16, U23.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [PROJECT_STATE.md](../docs/PROJECT_STATE.md)
- [HANDOFF.md](../docs/HANDOFF.md)
- [OPERATIONS.md](../docs/OPERATIONS.md)
- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [MODEL_AND_CONTEXT_GUIDE.md](../docs/MODEL_AND_CONTEXT_GUIDE.md)

## Implementation scope and checkpoints

1. Create concise role-based user guides for Superadmin, nursery admin/finance, teacher, and parent using the actual implemented screens and labels. Include onboarding, daily tasks, payment/receipt, bus/trips, payroll, and access-block messages.

2. Finalize installation/upgrade/backup/restore troubleshooting guides from Phase 23 evidence and list real deployment inputs still required. Do not claim a live nursery is deployed if it is not.

3. Finalize developer README, module map, schema/API links, commands, fixture setup, and instructions for targeted fixes or feature changes with Codex.

4. Check consistency of English/Egyptian Arabic terminology, document links, screenshots if present, model-picker instructions, and phase/state completion records. Correct documentation only when evidence supports the change.

5. Create docs/USER_ACCEPTANCE_WALKTHROUGH.md with the full manual scenario and blank result fields for the tech lead. Carry forward all known issues and unexecuted checks from Phase 24.

6. Update the short handoff with release candidate, finished phases, current risks, and next real operator action. If a logic/security defect is found, record it and use the appropriate stronger model/fix prompt in a separate session.

## Acceptance gate

- Setup and operation instructions match commands and screens that exist in the repository.
- Relative documentation links resolve; guide claims agree with Phase 24 evidence.
- The final walkthrough covers Superadmin setup through parent report, payment, transfer, payroll, blocking, import, and restore.
- No new financial/auth logic is introduced in this documentation phase; unresolved defects remain visible.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: New application behavior, unsupported launch claims, and sensitive logic repair under the documentation model.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Provide the tech lead a final review checklist, known issues, actual verification summary, and precise deployment/manual acceptance next steps.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 25: Operator guides, user walkthrough, and final handoff.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_25_operator_user_handoff.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

