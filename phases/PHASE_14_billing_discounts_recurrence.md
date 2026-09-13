# Phase 14 — Billing modes, equal discounts, and recurring charges

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Calendar recurrence and agreement allocation have expensive-to-fix financial edge cases. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Implement all three billing arrangements and connect them to guided onboarding.

## Prerequisites and context

Prerequisites: [Phase 13](../phases/PHASE_13_financial_core.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R10, R11, U14, U15.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [DECISIONS.md](../docs/DECISIONS.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Build agreement drafting/approval for recurring monthly, fixed term/year with installments, and separate additional fee with optional service period. Store category, normal/agreed amount, child allocation, due dates, and effective terms.

2. Implement Add Discount by entering the final agreed tuition total, showing its difference from normal tuition, and splitting the agreed total equally across selected children. Persist deterministic remainder allocation and never recompute historic splits.

3. For fixed agreements, validate installment amounts sum to the single obligation. For additional fees, a period label creates exactly one obligation and no recurrence.

4. Implement recurring generation through pg-boss using Cairo calendar dates, unique occurrence keys, locking, due-day clamping, immediate first approved period, bounded outage catch-up, and future-effective price changes.

5. Separate parent access blocks, child status, agreement pauses/ends, and finance module disable. Billing continues for a blocked parent; intentionally disabled finance periods require a catch-up preview approval.

6. Complete the tuition/discount/installment onboarding step using shared account/child/finance services. Collecting actual money is a separate explicit action implemented in Phase 15.

## Acceptance gate

- A13/A14: 10,000 normal to 8,000 agreed becomes two 4,000 obligations; 100.01 across three children conserves the total.
- A15: duplicate workers, short months, leap years, Cairo DST dates, pause intervals, and restart catch-up generate exactly the eligible periods once.
- A16/A17: a 12,000 agreement with three installments remains 12,000 debt; a period-labeled extra never repeats.
- A06/A31: parent block leaves charges running; intentional feature disable and re-enable follow the explicit catch-up workflow.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Automatic proration, attendance-derived charges, online payment collection, and automatic late penalties.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record billing calendar semantics, scheduler keys, onboarding integration, agreement version rules, and worked financial outputs.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 14: Billing modes, equal discounts, and recurring charges.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_14_billing_discounts_recurrence.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

