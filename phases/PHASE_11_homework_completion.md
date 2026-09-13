# Phase 11 — Homework assignments and individual completion

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **Medium reasoning** (closest available UI setting) before starting. The main challenge is faithfully connecting shared assignments to individual outcomes. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Publish homework once per classroom while recording each child's completion separately.

## Prerequisites and context

Prerequisites: [Phase 10](../phases/PHASE_10_exams_results.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R07, U11.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [DAILY_LEARNING.md](../docs/DAILY_LEARNING.md)
- [DECISIONS.md](../docs/DECISIONS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement assignment title/instructions, class, assigned date, due date, and a recipient snapshot. Publish shared content once and expose it to each authorized guardian.

2. Create per-child outcome events using configurable mapped statuses and optional notes. Teacher records completion; parent views remain readonly.

3. Use the documented due-date rule: future-due assignment visibility does not keep today's bar pending indefinitely; due-today outcomes remain pending until recorded or explicitly excused/N/A.

4. Support multiple assignments inside one Homework checkpoint, a classroom No homework today publication with exceptions, and reasoned content/outcome correction without destroying history.

5. Provide an efficient teacher checklist, overdue homework visibility, and child homework history. Transfer/scope changes must not grant a new teacher broad access to unrelated old-class records.

## Acceptance gate

- A11: one assignment supports distinct outcomes for multiple children; parent mutation attempts fail.
- A09: no homework, not completed, not yet recorded, and excused are visibly and semantically distinct.
- A08/A10: assignment or status corrections preserve previous versions and reject stale writers.
- A planned future due date and two assignments due today yield the documented single-slot progress behavior.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Parent upload/submission, automated grading, photo attachments, and homework marking by guardians.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record assignment/outcome contracts, exact daily due-date semantics, and parent display behavior.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 11: Homework assignments and individual completion.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_11_homework_completion.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

