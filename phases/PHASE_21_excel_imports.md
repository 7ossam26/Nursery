# Phase 21 — Excel templates, validation preview, and atomic import

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Bulk writes can bypass quotas and finance integrity unless they share transactional services. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Provide safe initial-data imports with understandable templates and row-level feedback.

## Prerequisites and context

Prerequisites: [Phase 20](../phases/PHASE_20_reports_pdf_excel.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R16, U21.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Produce downloadable versioned Excel templates for parents/children/links, opening unpaid child balances, and employee profiles/basic salaries. Use stable external keys and reference sheets for valid codes where appropriate.

2. Implement bounded file parsing, staging, row/sheet errors, normalized duplicate checks, required fields, cross-sheet links, valid branch/classroom/role scope, and a clear preview of creates/links/obligations/slot usage.

3. Keep plaintext passwords out of templates. Provide authorized one-time credential setup through the identity service, without emailing or messaging users. Do not create duplicate parent accounts for sibling rows.

4. Commit through the same onboarding, slot, employee, and finance services used by interactive screens. Revalidate current permissions, capacities, data versions, and template version after preview.

5. Use an atomic bounded batch commit with operation ID and stable import keys. Larger files are split into explicitly separate reviewed batches; do not silently accept half a failed batch.

6. Opening balance rows create dated outstanding obligations only; no receipts or treasury inflows. Provide commit summary, rejection reasons, and replay-safe status recovery.

## Acceptance gate

- A29: importing 2,500 opening debt increases outstanding by 2,500 and cash by zero.
- A30: quotas/scope changed after preview cause clear revalidation failure; retry does not duplicate records.
- A04/A03: concurrent final-slot imports and sibling/guardian links preserve account and child identity.
- A37: malicious spreadsheet cells/files, unsupported formulas, oversize input, and unauthorized role codes are handled safely.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Arbitrary database import/export, passwords in spreadsheets, payment-history reconstruction, and silent partial batch success.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record template versions, maximum batch sizes, duplicate policy, credential setup procedure, and import evidence.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 21: Excel templates, validation preview, and atomic import.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_21_excel_imports.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

