# Phase 09 — Attendance and daily classroom reports

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **Medium reasoning** (closest available UI setting) before starting. The workflow has precise semantics and reuses the checkpoint engine. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Give teachers one clear attendance task and publish each child's daily status immediately.

## Prerequisites and context

Prerequisites: [Phase 08](../phases/PHASE_08_configurable_checkpoint_engine.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R06, R07.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [DAILY_LEARNING.md](../docs/DAILY_LEARNING.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement classroom/date roster drafts with explicit bulk status entry and publication. Use configured Attendance mappings; never infer all untouched children as absent or present.

2. Show the daily task until published, preserve optional absence reasons, and let teachers append authorized reasoned corrections. Display internal correction history appropriately without child arrival/departure fields.

3. Implement daily report detail/history queries and the progress bar using snapshotted definitions. Recorded absence resolves reporting while remaining visually distinct from presence.

4. Support optional guardian planned-absence notices with date range and optional reason. A notice informs the teacher and never replaces confirmed attendance.

5. Handle active enrollment/classroom changes on the effective date, paused children, holidays/non-working days, and teacher assignment changes. Provide a clear No class day action instead of silently fabricating attendance.

6. Connect committed attendance publications to the scoped change-event boundary; parent hub live transport arrives in Phase 12.

## Acceptance gate

- A02/A09: only assigned rosters appear; missing, absent, present, and N/A remain distinct.
- A10: correction retains the original and handles stale versions without overwriting another teacher.
- A08: historical daily count and status label remain stable after configuration changes.
- A06/A31: blocked guardian or disabled attendance cannot read current attendance through a direct endpoint.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Child check-in/check-out times, bus attendance, and end-of-day-only parent visibility.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record attendance publication behavior, calendar defaults, daily report query, and future notification integration.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 09: Attendance and daily classroom reports.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_09_attendance_daily_reports.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

