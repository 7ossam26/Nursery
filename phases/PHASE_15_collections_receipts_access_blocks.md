# Phase 15 — Collections, outstanding balances, receipts, and manual blocks

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. This connects money services to high-use screens where clear user actions prevent errors. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Let finance staff see what is owed, record actual collection, issue receipts, and separately control parent access.

## Prerequisites and context

Prerequisites: [Phase 14](../phases/PHASE_14_billing_discounts_recurrence.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R11, R16, U03.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Build outstanding accounts and child finance views with unpaid/partial/paid installments, upcoming/overdue filters, branch/classroom/category filters, totals, and clear remaining amounts.

2. Implement collection dialogs with amount, collection date, external payment method, destination account, allocations, and confirmation. The mark-paid action defaults to the required remaining amount and invokes PaymentService.

3. Handle duplicate clicks and uncertain network outcomes using one operation ID and a safe operation-status lookup before a new attempt. Never flip a paid checkbox locally without a committed receipt.

4. Generate printable A4 PDF receipts from server-owned receipt data with bilingual typography, nursery branding, receipt reference, collection details, and remaining balance. Add an authorized download route and controlled generated-file retention.

5. Implement due-date reminder jobs using deduplicated in-app notifications. Add manual resend; do not repeatedly spam or add automatic late fees.

6. Add an authorized admin Block parent action with a safe contact-nursery message and optional end date. Blocking is manual and independent from billing; revoke active API/SSE/file access and clear visible client data.

7. Complete optional initial-payment onboarding and permitted parent balance/receipt views. Show a family total only when the guardian may view every included line.

## Acceptance gate

- A18/A19: browser retry/double click creates one valid collection; concurrent full settlements cannot overpay.
- A06/A34: manual blocking interrupts existing access without canceling debt or freeing seats; overdue notice alone never blocks.
- A35/A37: an A4 Arabic receipt renders without clipped text and cannot be downloaded by another family.
- Partial tuition collection shows correct remaining balance and the correct real account inflow.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Automatic debt enforcement, payment gateways, payment-proof uploads, and editable paid booleans.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record collection screens, receipt renderer, reminder schedule, block/revocation behavior, and financial evidence.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 15: Collections, outstanding balances, receipts, and manual blocks.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_15_collections_receipts_access_blocks.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

