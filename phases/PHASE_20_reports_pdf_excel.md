# Phase 20 — Management reports and PDF/Excel exports

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Terra**, **Medium reasoning** (closest available UI setting) before starting. Read-only projections and standardized exports suit a precise, repeatable implementation phase. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Provide useful management summaries and exports that reconcile with the underlying records.

## Prerequisites and context

Prerequisites: [Phase 19](../phases/PHASE_19_employee_payroll.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R16.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [PRODUCT_REQUIREMENTS.md](../docs/PRODUCT_REQUIREMENTS.md)
- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Build retained-module reports for collections/refunds/spending/overdue debt/accounts/payroll and children/capacity/attendance/exams/homework/bus/trips/incidents/document expiry.

2. Use common date/branch/classroom/category filters with bounded pagination and indexed canonical projections. Do not add excluded module reports or manufacture numeric averages across incompatible grades.

3. Show practical monthly cash result with collections minus refunds and actual operating outflows; separate unpaid obligations, pending expenses, internal transfers, and other income.

4. Keep classroom-attributed expenses explicit; unattributed branch costs remain unallocated rather than being arbitrarily distributed to produce a classroom profit figure.

5. Extend the A4 PDF renderer and Excel export service with branding, correct bilingual fonts, readable headers, generation date/filter context, and scoped private downloads.

6. Use bounded worker jobs for large exports, creator/scope metadata, expiry cleanup, current authorization at download, and spreadsheet formula-injection defenses.

## Acceptance gate

- Report totals reconcile to known receipt, refund, expense, transfer, and payroll fixtures, including A21/A24/A26.
- A01/A34/A37: list aggregates and exported rows cannot reveal inaccessible children, branches, or payroll.
- A35: sample Arabic/English PDFs render on A4 without truncation; Excel amounts/dates are usable and safe.
- Measure representative query plans and eliminate a demonstrated N+1 or unbounded scan; record actual fixture size and timing.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Statutory financial statements, complex BI builders, and hypothetical performance guarantees.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record report formulas, export job/download rules, sample rendering checks, and query measurements.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 20: Management reports and PDF/Excel exports.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_20_reports_pdf_excel.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

