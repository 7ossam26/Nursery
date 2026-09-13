# Phase 23 — Dokploy deployment assets, backup, restore, and support

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. Repeatable operations require careful integration of secrets, migrations, files, and recovery. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Prepare a reproducible independent nursery installation and prove recovery in an isolated environment.

## Prerequisites and context

Prerequisites: [Phase 22](../phases/PHASE_22_pwa_network_accessibility.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R01, R16.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [OPERATIONS.md](../docs/OPERATIONS.md)
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Create production Dockerfile/build stages and Dokploy Compose assets for API/worker/PostgreSQL with pinned versions, health checks, persistent private files, same-origin routing, and safe resource/concurrency defaults.

2. Provide environment validation, one-time bootstrap, deployment naming/isolation, migration lock/start sequence, graceful shutdown, and explicit upgrade/rollback instructions. Dokploy handles HTTPS; do not add Nginx without a concrete need.

3. Implement scheduled/pre-upgrade backups with database and file consistency, encrypted off-host destination configuration, retention, checksums, and redacted job status. Prevent overlap and make failures visible.

4. Implement Superadmin support tools for audit/search/job status, authorized account reset/block/release, safe data archival, backup creation, and controlled restore initiation. Do not expose a raw shell or arbitrary filesystem browser.

5. Implement restore validation to a fresh isolated target, manifest verification, file/database checks, migration compatibility, fresh session revocation, and explicit destructive confirmation at the actual restore step.

6. Exercise build/start/migration/backup/restore using local disposable infrastructure where available. Produce exact operator steps and list missing real domain/backup destination/secrets without inventing them.

## Acceptance gate

- A38: restore a synthetic installation into an isolated target and verify login, file retrieval, debt, treasury, and settings.
- No database/public file volume is exposed through the web router; images contain no environment secrets.
- Worker restart and migration rerun are safe; failed backup/restore is visible with redacted details.
- Record what was actually tested. Live nursery deployment is a separate operator action after the package is reviewable and authorized.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Purchasing hosting, guessing VPS capacity, central SaaS provisioning, and automatic production restore/deployment.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record reproducible commands, build tag, backup/restore evidence, remaining real deployment inputs, and measured limitations.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 23: Dokploy deployment assets, backup, restore, and support.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_23_dokploy_backup_support.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

