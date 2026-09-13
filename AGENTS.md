# Nursery project instructions

This repository implements the nursery product defined in docs/PRODUCT_REQUIREMENTS.md. Planning baseline: 2026-09-13. The supplied files are a plan; implementation starts at Phase 01.

## Working protocol

1. Read this file, docs/PROJECT_STATE.md, docs/HANDOFF.md, the current phase file, and only its named reference sections.
2. Inspect the actual code and current diff before editing. Preserve unrelated work. Never assume a previous phase ran merely because its plan exists.
3. Execute the selected phase only, through its stated acceptance checks. Update the state after each meaningful checkpoint. A phase may span sessions; resume from evidence.
4. Use English for code, identifiers, documentation, and reports. Product copy supports Egyptian Arabic and English.
5. Keep changes scoped. Fix a prerequisite defect when necessary and record it. Do not rebuild working modules or redesign the UI during an unrelated fix.
6. Reuse domain services and contracts. Frontend forms, imports, jobs, and support actions must enforce the same business rules.
7. Verify consequential rules with focused tests. Use real PostgreSQL for transactions, scopes, quotas, and billing races. Do not substitute SQLite or mocks for those checks.
8. Report actual commands and results; distinguish not run, blocked, failed, and passed. Never invent test, deployment, or performance evidence.
9. At a context boundary update docs/PROJECT_STATE.md and docs/HANDOFF.md before continuing. Keep their active summaries short; link detailed evidence.
10. Do not perform later phases, introduce parallel agents, change model settings, or deploy to a live nursery as a side effect of a phase.

## Invariants

- One nursery per deployment; isolated database and file storage. Branches share module settings. Access is checked on the server by permission, assigned branches, assigned classrooms, and child/guardian links.
- Custom role names are data. Reserved system identity and stable capability keys are infrastructure, not hardcoded business roles.
- Parent and employee account slots are separate reservations. Deactivation, archival, expiry, and suspension never release them. Only Superadmin can explicitly release a reservation.
- Parent access blocking is an explicit admin action. Overdue fees produce notifications, not automatic parent blocks.
- Published learning records are append-only. Teachers may issue reasoned corrections within their authorized classrooms. Keep original records.
- Monetary amounts use integer piastres with exact arithmetic. Charges, payments, credit, refunds, and treasury movement are distinct.
- Charge creation never creates cash. Payment allocation, treasury movement, audit, and idempotency records commit atomically.
- Bus charges accept full settlement only. Family agreed tuition is split equally across included children with deterministic cent rounding.
- Branch transfer moves outstanding receivables without moving cash; prior receipts keep their historical branch.
- Monthly payroll pays the full remaining amount once; advances already paid must not be counted twice.
- No child arrival/departure fields. Technical audit timestamps remain private operational metadata.
- No camera feeds, chat, complaints, meal/media tracking, employee attendance/HRM, payment gateway, offline mutation queue, or shared SaaS tenancy in V1.

## Delivery

Update relevant contracts and decisions when behavior changes, then state files changed, focused verification, remaining risks, and the next phase. User instructions override this plan; document the change without silently rewriting history.
