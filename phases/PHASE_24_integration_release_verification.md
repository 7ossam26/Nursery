# Phase 24 — Cross-module verification and release fixes

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. The most capable model should assess interactions between security, money, learning, and operations. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Verify the complete implementation against the agreed requirements and fix evidenced release blockers.

## Prerequisites and context

Prerequisites: [Phase 23](../phases/PHASE_23_dokploy_backup_support.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R01–R17, A01–A38.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)
- [TRACEABILITY.md](../docs/TRACEABILITY.md)
- [DECISIONS.md](../docs/DECISIONS.md)
- [PROJECT_STATE.md](../docs/PROJECT_STATE.md)

## Implementation scope and checkpoints

1. Review traceability against actual code and phase evidence, identifying any unimplemented promise, unsafe bypass, fake/demo path, or accidental excluded feature.

2. Run the established full relevant verification gate, then exercise A01–A38 with real PostgreSQL and critical browser workflows. Use fixture clocks for recurrence/license dates and controlled races for payments/imports/transfers.

3. Fix reproduced defects at their shared service boundary; update relevant contracts/tests and rerun only affected checks plus the final required gate. Do not spend the phase on unrelated architecture rewrites.

4. Review privacy across direct URLs, reports, SSE, generated downloads, theme/settings guards, account release, and parent/employee scope changes.

5. Measure the documented performance targets on an identified test environment with a recorded fixture/concurrency. Capture failures as concrete bottlenecks; do not claim unspecified Hostinger capacity.

6. Write docs/ACCEPTANCE_EVIDENCE.md and docs/KNOWN_ISSUES.md with scenario/build/environment/result and severity. Preserve not-run/blocked distinctions and a clear user-led final manual walkthrough.

## Acceptance gate

- A01–A38 have actual evidence or an explicit not-run/blocked reason; no check is pre-marked passed.
- All consequential discovered defects are resolved or clearly block release with reproduction steps.
- Fresh setup, migration, core end-to-end flow, and isolated restore are either demonstrated or explicitly outstanding.
- There are no uncommitted accidental secrets or unrelated modifications in the final review diff.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: New product features, disguising missing infrastructure as passing tests, and automatic live release.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record release candidate identity, actual evidence summary, blockers/known limitations, and the documentation work remaining for Phase 25.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 24: Cross-module verification and release fixes.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_24_integration_release_verification.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

