# Phase 10 — Exams, grades, and corrections

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **Medium reasoning** (closest available UI setting) before starting. Clear classroom input and grade rules can use the existing publication architecture. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Let teachers publish exam details and grades with a readable history for each child.

## Prerequisites and context

Prerequisites: [Phase 09](../phases/PHASE_09_attendance_daily_reports.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R07, U12.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [DAILY_LEARNING.md](../docs/DAILY_LEARNING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Create subject and exam-type catalogs controlled by authorized nursery staff, plus exam name/date/classroom, selectable type, grade format, and maximum where numeric.

2. Build a classroom result-entry roster with optional child comments, explicit missing/excused/not-applicable outcomes, and validation against the exam's snapshotted grade format.

3. Publish through the immutable learning service and support teacher reasoned corrections within current scope. Snapshot exam metadata so later catalog edits do not rewrite published results.

4. Project multiple exams into one daily Exam result checkpoint. Resolve only when all applicable published exams have an outcome, or an explicit No exam today action applies. New applicable publications may change the day's current completeness.

5. Provide child exam history with subject/type/date filters and accurate numeric earned/maximum display; never synthesize numeric averages for incompatible or nonnumeric grading schemes.

## Acceptance gate

- A09: 0/10 is a real score, a missing result is not zero, and out-of-range values are rejected.
- A10: concurrent grade corrections preserve one effective result and the earlier published record.
- A02/A03: assigned teachers and linked guardians see the correct children only.
- Adding a second exam keeps one checkpoint slot and correctly updates pending/completed meaning.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: AI grading, full curriculum planning, parent submissions, and destructive editing of published grades.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Document grade formats, exam checkpoint aggregation, correction display, and catalogs.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 10: Exams, grades, and corrections.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_10_exams_results.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

