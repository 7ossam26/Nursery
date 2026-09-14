# API and data contracts

This document fixes important ownership and invariants. Each phase adds the actual schema and OpenAPI definitions incrementally.

## Public API conventions

Phase 08 implementation: [CHECKPOINT_ENGINE.md](CHECKPOINT_ENGINE.md) defines the version/snapshot schema, strict `/api/v1/learning` actions, expected revisions, idempotency, correction chains, scoped outbox and built-in adapter transaction protocol. Runtime inputs live in packages/contracts/src/learning.ts; migration 0006_learning.sql follows 0005.

Use /api/v1. Responses contain data plus safe metadata; errors use code, messageKey, fieldErrors, requestId, and retryable. Do not expose database errors or raw internal reasons.

Use UUID resource IDs, date-only YYYY-MM-DD strings for business dates, UTC ISO timestamps for audit events, and integer-string piastre amounts. Pagination has a bounded limit. Sorting/filter fields are allowlisted.

Financial/publication/import/transfer actions accept a client operation ID. Conflicting reuse returns IDEMPOTENCY_CONFLICT. Mutable drafts accept expectedVersion; a stale update returns STALE_VERSION. Permission failures, blocked accounts, disabled modules, and expired licenses have distinct safe codes.

REST action examples: POST /payments; POST /payments/:id/corrections; POST /children/:id/branch-transfers; POST /attendance/publications; POST /learning/records/:id/corrections; POST /homework/:id/outcomes; POST /payroll/:id/settlements; POST /imports/:id/commit. Keep domain actions explicit; never expose arbitrary SQL-style record patching.

## Critical relational groups

### Phase 03 implemented identity contract

The runtime schemas live in `packages/contracts/src/index.ts`; routes, defaults, operator procedures, and revocation integration are documented in [AUTHENTICATION.md](AUTHENTICATION.md). Authentication responses return `data.account` (ID, normalized username, reserved kind, locale, forced-change flag, capability list), `csrfToken`, `expiresAt`, and `idleExpiresAt`. Phase 04 supersedes the former `policyReady: false` placeholder with `policyReady: true` and current `scope` (revision, mode, branch/classroom IDs); see [organization and policy contracts](ORGANIZATION_AND_POLICY.md). The latter deadlines are technical session values, never child arrival/departure data. Strict input schemas reject unrecognized fields. Errors may include `publicMessage` only for the explicitly intended account contact copy, never an internal reason. Unimplemented business actions remain unavailable.

### Phase 04 organization and permission contract

`packages/contracts/src/organization.ts` defines strict organization/role/assignment payloads, bounded query inputs, and advisory capacity warnings. `/api/v1/organization` provides scoped lists/details, versioned organization edits, SYSTEM role-definition/delegation/grant controls and delegated staff assignments. The transaction, SQL scope, future resource-delivery and support helpers are documented in [ORGANIZATION_AND_POLICY.md](ORGANIZATION_AND_POLICY.md). Migration `0002_organization_policy.sql` enforces composite classroom/branch assignment foreign keys, unique codes and append-only audit snapshots. D30 defines the role-independent scope mode and anti-escalation defaults.

### Phase 05 licensing, slots, and nursery settings contract

`packages/contracts/src/licensing.ts` defines license limits/renewal/provisioning/module/theme payloads; `packages/contracts/src/identity.ts` holds the username/password schemas relocated out of `index.ts` to avoid a circular import. `/api/v1/licensing` provides seat-reserving staff/parent provisioning, explicit Superadmin release/restore, deactivate/reactivate/block/unblock, license limits and manual renewal payments, module settings with a finance catch-up preview gate, and Superadmin-only nursery branding/theme with server- and client-side contrast validation. Migration `0003_licensing_settings.sql` adds `license_limits`, append-only `seat_reservations`/`license_renewal_payments`/`licensing_audit_events`, `nursery_settings`, `module_settings`, and `module_settings_history`, plus seven capability rows. `CurrentAccount.licenseStatus` (computed in `loadPolicy`) reports `NOT_CONFIGURED | ACTIVE | GRACE | SUSPENDED` and blocks every non-SYSTEM request once suspended. D31 records the seat/module-dependency/branding defaults; see [LICENSING_AND_SETTINGS.md](LICENSING_AND_SETTINGS.md) for services, routes, and evidence.

| Group | Records and essential fields |
|---|---|
| Installation | installation singleton; license dates/grace; purchased capacities/unit prices/agreed total; manual subscription renewal records; feature_settings/version; branding/version |
| Identity | accounts(kind, username_normalized, password_hash, status/version); sessions(token_hash, expiry); account_status_history |
| Licensing | limits(kind, capacity); seat_reservations(account_id, kind, reserved_at, released_at, released_by) |
| Permissions | roles; capabilities; role_capabilities; account_roles; delegated_assignable_roles; sensitive_grants |
| Organization | branches(code); classrooms(branch_id, capacity, age_group); account_branches; teacher_classrooms; treasury mapping |
| Children | children; child_status_history; child_classroom_history; guardian_child_links(permission flags); contact records; files |
| Safety | pickup_authorizations(valid_on/range, restricted flag); date-only pickup_records(call_confirmed); health_notes; allergies; incidents |
| Learning config | checkpoint_definitions; checkpoint_versions; status_versions(progress meaning, built-in mapping); daily_snapshots |
| Learning records | immutable learning_events(child, date, checkpoint snapshot, revision, supersedes, reason); attendance_records(event, mapped presence, optional absence reason); guardian/date planned-absence advisories; append-only unexpected-absence alert boundary |
| Exams | subjects; exam_types; exams(grade_format, maximum, date, class, version); result_events |
| Homework | assignments(class, assigned_on, due_on, version); recipients; child outcome_events |
| Communication | announcements; recipients; acknowledgments; notifications(unique event/recipient); change_outbox |
| Billing | fee_categories; agreement_versions; child_allocations; obligations; installments; recurrence_occurrences |
| Payments | financial_operations; receipts; receipt_allocations; credits; credit_allocations; refunds/corrections |
| Treasury | accounts(branch/type/code); immutable signed movements; account_transfers; daily_closings/revisions |
| Expenses | expense_categories; expenses(due amount/date, scope); approval_events; settlements/documents |
| Branch transfer | debt_transfers; transferred_due_items; ownership_history; stable source references |
| Transport/events | bus_subscriptions/periods/permission; events; selected_children; external_consent; financial links |
| Payroll | employee_profiles; salary_history; payroll_periods(paying_branch/account, salary snapshot); adjustments; advances; final_settlements |
| Data operations | import_batches/staging/errors/commit_receipts; export_jobs/files; backup_jobs; audit_events |

An employee financial profile can exist without a login; it gets a seat only when a STAFF login is provisioned. Identity/account removal cannot cascade through financial history.

## Required database constraints

- Unique normalized username per installation database; case/whitespace normalization is deterministic.
- One unreleased seat reservation per account; kind matches account kind. Allocation locks the capacity row.
- Unique branch/account codes; classroom-to-branch FK and classroom assignment consistency.
- Unique guardian/child link; reject attaching an inaccessible child by guessed ID.
- Unique daily snapshot child/date; immutable referenced configuration versions.
- Unique active revision/supersession edge for a logical published record; expected revision compared in transaction.
- Numeric exam score within its snapshotted maximum; missing result distinguished from zero.
- Unique monthly occurrence business key; agreement-period eligibility checked while locked.
- Installment total equals its agreed allocation before agreement approval.
- Payment allocations cannot exceed available receipt amount or remaining obligation; enforce while locking all affected rows in a stable order.
- Movement source/leg uniqueness prevents duplicate ledger entries; append-only settled records.
- Unique transfer operation key; transfer items reference their original debt and retain cumulative ownership.
- Unique employee/month final payroll settlement; aggregate deductions/advances bounded within the locked period.
- Unique import commit key and notification event/recipient keys.
- Every scoped file/export job references its creator and permitted resources.

Foreign keys with history default to restrict/retire behavior. Critical cross-row checks belong in transactional services backed by indexes/constraints; a browser validation alone is insufficient.

## Amount and status projections

Phase16 expense/transfer checkpoint: strict schemas in `packages/contracts/src/spending.ts`, immutable sources and deferred source/leg constraints in `0014_spending.sql`, `SpendingService` using the existing FinancialCore/policy/canonical treasury projection. `/api/v1/expenses` implements pending/approval/actual settlement/history and scoped private documents; `/api/v1/finance/transfers` posts paired internal movements. Pending expense creates no cash, settlement is unique, and filtered totals exclude transfers. PrivateDocumentStore is shared with child documents; every expense attachment requires fresh scope/capability/module checks. Defaults/evidence and outstanding correction/refund gate: [EXPENSES_AND_CLOSING.md](EXPENSES_AND_CLOSING.md), D42.

Phase16 closing checkpoint: migration0015 implements immutable COUNTED/REOPENED successors, source-linked current-date difference adjustments and shared account-lock/SQL protection against changes affecting any active counted date. `ClosingService`, `packages/contracts/src/closing.ts` and `/api/v1/finance/{closings,closing-options,closing-current}` expose count/reopen/adjust and authorized history/current revision. Reopening/adjustment require capability AND sensitive grant AND branch scope; no SYSTEM fallback. Original counts remain immutable; canonical dated expected balance and generated difference use PostgreSQL exact numeric projections. Bilingual page `/administration/closing` separates physical count from explicitly confirmed cash adjustment. Receipt/tuition corrections and refunds remain outstanding; D43 and EXPENSES_AND_CLOSING.md record evidence.

Phase 13 implements these formulas in PostgreSQL views `installment_balances`, `obligation_balances`, `credit_balances`, and `treasury_balances` (migration 0011). Strict runtime inputs in `packages/contracts/src/finance.ts` use canonical integer-string piastres and normalized UUIDs; aggregates stay exact strings beyond JavaScript's safe-integer range. `FinancialCore`, `LedgerService`, `PaymentService`, and `TreasuryService` share current policy/module checks and transactional locks. APIs, receipt print DTO, retry rules, scope predicates, migration implications and actual verification are documented in [FINANCIAL_CORE.md](FINANCIAL_CORE.md). These services do not grant existing roles new capabilities or expose correction/refund/closing workflows.

Debt = approved base obligation amounts + signed obligation adjustments - effective receipt allocations - applied credits. Installment rows describe due portions and are not added as another obligation. Account balance sums all posted signed movements, including the opening movement and each original/reversing entry exactly once. Do not both remove an original movement from the sum and count its negative reversal.

Paid flags, installment state, bus settlement, progress counters, and dashboard totals are projections of canonical records. Do not maintain independently writable paidTotal, treasuryBalance, or dailyProgress values that can drift.

A transferred obligation retains original attribution and a current owner for its remaining due items. Paid source history and transferred outstanding items must not both count as new debt.

## Cross-domain service interfaces

- IdentityService.provisionAccountWithSeat(actor, input, operationId)
- ChildService.onboard(actor, familyInput, operationId) coordinates account/links/children and approved finance components.
- LearningService.publish/correct(actor, child/date scope, expectedVersion, operationId)
- BillingService.draft/approve/generateOccurrence/previewCatchup(actorOrJob, terms, occurrenceKey)
- PaymentService.collect/correct/refund(actor, allocations, account, expectedVersion, operationId)
- TreasuryService.postMovement/transfer/close(actor, source, operationId)
- ChildTransferService.transfer(actor, child, from/to, operationId)
- PayrollService.recordAdvance/settleMonth(actor, period, operationId)
- ImportService.preview/commit(actor, batch, expectedPreviewVersion, operationId)

These names describe responsibilities; implementation naming can follow the repo convention. All entry points must share the same invariants and authorization. Reports read canonical projections and cannot mutate source data.

Phase 14 adds `billing_agreements`, `billing_children`, `agreement_versions`, `billing_pauses`, `billing_periods`, `recurrence_occurrences`, and `billing_catchup_approvals` in migration `0012_billing.sql`. Stored allocation JSON is an immutable financial snapshot; occurrence uniqueness and the approved-term trigger prevent historic re-splitting. `billing-monthly-v1` is a pg-boss worker contract, not a browser mutation queue.

## Event and job contracts

Durable events have ID, kind, installation-local scope, resource revision, safe recipient references, and created_at. Parent-facing payloads contain authorized invalidation hints, not broad row dumps. Recipient links are revalidated when reading and dispatching.

Jobs carry trusted resource IDs and an idempotency/business key. They reconstruct current rules and permissions/configuration; serialized old payloads cannot bypass later blocks. Job retry is not evidence the underlying mutation failed. Save success before acknowledging.

## Imports

Templates are versioned and use stable external keys. Parent/child template has related sheets for parents, children, and links; do not duplicate accounts per child row. Employee template may create profile-only entries or provision a login through the quota service.

Do not embed plaintext passwords in bulk templates. Create credential setup/reset results through an authorized one-time flow. Validate optional role/branch codes against delegated scope.

Opening debt import creates dated outstanding obligations with a source label and due date. It creates no receipt, income, or treasury movement. Preview and commit check current quotas, permissions, duplicates, and template version again.

## Phase 06 implemented child and document contract

Migration 0004_children_guardians.sql and packages/contracts/src/children.ts implement R05/U08. ChildService coordinates LicensingService.provisionInTransaction in the same PostgreSQL transaction; no duplicate seat, child financial ledger, or financial formulas are created. Mutable actions require strict expectedVersion/expectedChildVersion. Guardian links separately authorize read, finance, pickup and notify; guardian account kind never inherits staff scope permissions. requireGuardianChild and activeClassroomChild are the reusable future resource gates.

Namespaces: /api/v1/children (options, scoped search/detail, onboarding, update, lifecycle, classroom-moves, guardian-links, documents), /api/v1/guardians (scoped picker/profile update), /api/v1/parent/children (linked active children plus minimal paused contact cards), /api/v1/child-documents (download, retire, SYSTEM abandoned cleanup). Document upload is bounded JSON/base64, uses existing cookie/CSRF rules and real content validation; download is authenticated binary attachment, never a public URL. Responses omit storage keys, technical timestamps and unrelated guardian data. The full required fields, route verbs, limits, lifecycle and future billing boundary are documented in [CHILDREN_AND_DOCUMENTS.md](CHILDREN_AND_DOCUMENTS.md); defaults are D32.

## Phase 07 implemented safety contract

Migration 0005_safety.sql and packages/contracts/src/safety.ts implement R08/U19 with R09 WhatsApp links. SafetyService reuses ChildService.withPolicy locks, resolveChild/requireChild staff scope, requireGuardianChild link gates and child_audit_events. Namespaces: /api/v1/children/:id/safety (staff aggregate view), /api/v1/parent/children/:id/safety (guardian view), /api/v1/children/:id/{health-entries,pickup-authorizations,pickup-restrictions,pickup-records,incidents}, /api/v1/health-entries/:id (update, retire), /api/v1/pickup-authorizations/:id/{deactivate,review}, /api/v1/pickup-restrictions/:id/deactivate, /api/v1/incidents/:id. Strict schemas, expectedVersion on mutable rows, distinct MODULE_DISABLED code, 409 rule rejections with safety.* message keys. Tables: health_entries, pickup_authorizations (review state), pickup_restrictions, append-only date-only pickup_records (call_confirmed checked true, no clock fields), incidents (wall-clock occurrence), append-only notification_events (kind, child/branch scope, resource type/id/revision, recipient snapshot, hint payload). Rules, permissions, event contract and evidence: [SAFETY.md](SAFETY.md); defaults D33.

## Phase 10 implemented exam contract

Migration 0008_exams.sql and packages/contracts/src/exams.ts implement R07/U12 on the Phase 08 checkpoint engine, reusing the EXAM checkpoint definition already seeded in 0006_learning.sql. `/api/v1/exams` provides subject/exam-type catalog reads (learning.read) and writes (new delegable exams.catalog capability), classroom-scoped exam creation (learning.publish), per-exam roster reads, batch result publication, single reasoned corrections, a classroom-scoped No exam today action, and per-child history with subject/type/date filters. Exam definitions and exam_results are append-only (immutability triggers); subjects/exam_types stay editable/retirable, since every exam snapshots the subject/type name it used at creation. Numeric results use exact `numeric` marks bounded by the exam's own snapshotted maximum/decimal flag; label results must be one of the exam's own snapshotted label options; a missing result is never a zero. Because several exams can share one classroom/date, all of a child's same-day exam activity shares one EXAM checkpoint slot recomputed from every applicable exam's current outcome, using a narrow adapter-only extension to `LearningService.appendInTransaction` (`{ aggregateTransition: true }`, kind-gated to EXAM) that never weakens the public custom-checkpoint transition rule. Defaults, aggregation rules, and evidence: [EXAMS.md](EXAMS.md); D36.

## Phase 11 implemented homework contract

Migration 0009_homework.sql implements shared assignment/recipient snapshots, independent append-only content/outcome versions and scoped content invalidations. API namespace /api/v1/homework: publish/list, :id/roster, :id/corrections, :id/versions, outcomes, outcomes/corrections, no-homework-day, children/:id/history. Reuses learning.read/learning.publish, ChildService.withPolicy and LearningService.operation/appendInTransaction. Outcome expectedVersion is per assignment/child, not the aggregate slot version. D37/HOMEWORK.md document dates/limits/scopes/readonly parent display and exact due rule.

## Phase 12 communication contract (gate pending)

Migration 0010 and communication.ts implement immutable targeted announcements/recipient witnesses, independent acknowledgments and a durable unique event/guardian inbox over immutable sources. Namespaces: /api/v1/announcements (publish, options), /parent/announcements (list/detail/acknowledgment), /parent/notifications (list/read state), /parent/contact and authenticated /parent/live SSE. Every parent list/count/target revalidates current links/child/modules; SSE payloads are empty invalidations. Homework history gains an optional `on` date filter matching assignments assigned or due that day before pagination. D38 and PARENT_HUB_AND_NOTIFICATIONS.md document limits, producers, privacy, reconnection and actual verification; Phase 12 is not complete yet.

DailySlot's optional homework reporting context drives one HOMEWORK bar slot from persisted assignments/dated outcomes, including future assignment reporting and lazy due-day pending without fake publication events; frozen status meanings remain immutable. Aggregate transition support accepts EXAM or HOMEWORK only, never public custom checkpoints. All adapter/event/audit/idempotency/outbox work commits together; Phase 12 owns real dispatch/revalidation, with no sender in this phase. See [HOMEWORK.md](HOMEWORK.md).
