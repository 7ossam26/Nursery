# Phase 05 — Superadmin, subscriptions, slots, and nursery settings

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. Several established services must be connected without weakening licensing or access rules. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Give the developer control of this deployed nursery, account capacities, subscription state, feature setup, and branding.

## Prerequisites and context

Prerequisites: [Phase 04](../phases/PHASE_04_branches_roles_scopes.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R01–R04, U01, U04, U05, U07.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [DECISIONS.md](../docs/DECISIONS.md)
- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement separate parent and employee reserved-slot counters and an atomic provisioning service. Reserve under a lock, enforce capacities on the server, and never free a reservation from ordinary deactivation, archive, or expiry.

2. Create Superadmin account release/removal with explicit confirmation and audit, preserving linked child/finance/audit history. Release credentials and reservation rather than cascading through business records. Profile-only employees do not consume login slots until provisioned.

3. Implement manual monthly/yearly platform subscription dates, configurable grace default, renewal warnings, post-grace normal-access block, and renewal restoration. Record separate unit prices against purchased parent/employee capacities, the period estimate, any explicit agreed-total override, and manual renewal payments as D28 specifies. Keep these outside child tuition/branch treasury. Root support stays available; no payment gateway, automatic collection, or implicit proration.

4. Build nursery name/logo/contact settings, theme editing with preview and contrast validation, role/sensitive grants management, staff/parent account provisioning, deactivation/reactivation, and temporary account blocks.

5. Implement nursery-wide module settings shared by every branch, dependency validation, settings versioning, and job/request guards. Document supported disabled states; preserve administrative history and require preview before finance catch-up after intentional disable.

6. Give Superadmin access to permitted nursery management tools using an explicit audited context. Keep support-only actions visually separate from normal administration.

## Acceptance gate

- A04/A05: race at the final slot; exactly one succeeds, and deactivated accounts continue reserving slots until explicit Superadmin release.
- A07: grace and renewal boundaries obey Cairo dates; expiry never deletes records or frees slots.
- Commercial estimates use purchased capacities even when fewer users are active, and recording platform renewal does not post money into the nursery's child-fee treasury.
- A31: module settings are identical across branches and enforce dependencies on the API, not merely navigation.
- A35: unacceptable text contrast is blocked or corrected with clear feedback; branding propagates across screens.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Remote management of other installations and backup/restore execution tools, which arrive in Phase 23.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record licensing defaults, seat counting/release semantics, feature dependencies, and any incomplete future-module adapters.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 05: Superadmin, subscriptions, slots, and nursery settings.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_05_superadmin_licensing_settings.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~
