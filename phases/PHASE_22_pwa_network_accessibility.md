# Phase 22 — PWA, network recovery, and usability hardening

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **Medium reasoning** (closest available UI setting) before starting. Cross-screen interaction and accessibility polishing benefit from careful integration work. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Make the complete product dependable and easy to use on parents' phones.

## Prerequisites and context

Prerequisites: [Phase 21](../phases/PHASE_21_excel_imports.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R04, R16.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement installable PWA manifest, icons, application-shell caching, and controlled update handling. Never cache authenticated API data, private documents, or protected pages for offline use.

2. Implement a clear connection-problem modal, memory-only unsaved form preservation, reconnect refresh, and mutation controls. Do not queue offline writes or resubmit a payment under a new operation ID.

3. Audit logout/account block/license expiry/scope loss across query caches, open tabs, SSE, private downloads, and history navigation. Clear application-controlled visible/cached sensitive data and reauthorize fresh reads.

4. Finish responsive parent/teacher/admin layouts using grouped navigation, large text/targets, restrained animation, reduced motion, keyboard access, and complete bilingual copy.

5. Validate theme changes across forms, status badges, charts, dialogs, and PDF templates. Add meaningful text/shape labels where color could confuse users.

6. Test an interrupted payment and publication through the real UI, including a server-committed response that never reaches the browser, and demonstrate safe recovery.

## Acceptance gate

- A35: representative 360px RTL/LTR screens pass contrast/keyboard/focus/reduced-motion review with no page overflow.
- A36/A18: interrupted input stays in memory and uncertain payment resolves to its original receipt.
- A06: blocking an open parent app revokes API/SSE/download access and clears application-controlled data.
- An installed PWA opens a safe offline shell; network tools confirm private responses are not service-worker cached.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Offline working mode, native push, React Native app implementation, and a redesigned navigation system.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record supported browser checks, service-worker strategy, cache revocation behavior, and remaining usability issues.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 22: PWA, network recovery, and usability hardening.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_22_pwa_network_accessibility.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

