# API and data contracts

This document fixes important ownership and invariants. Each phase adds the actual schema and OpenAPI definitions incrementally.

## Public API conventions

Use /api/v1. Responses contain data plus safe metadata; errors use code, messageKey, fieldErrors, requestId, and retryable. Do not expose database errors or raw internal reasons.

Use UUID resource IDs, date-only YYYY-MM-DD strings for business dates, UTC ISO timestamps for audit events, and integer-string piastre amounts. Pagination has a bounded limit. Sorting/filter fields are allowlisted.

Financial/publication/import/transfer actions accept a client operation ID. Conflicting reuse returns IDEMPOTENCY_CONFLICT. Mutable drafts accept expectedVersion; a stale update returns STALE_VERSION. Permission failures, blocked accounts, disabled modules, and expired licenses have distinct safe codes.

REST action examples: POST /payments; POST /payments/:id/corrections; POST /children/:id/branch-transfers; POST /attendance/publications; POST /learning/records/:id/corrections; POST /homework/:id/outcomes; POST /payroll/:id/settlements; POST /imports/:id/commit. Keep domain actions explicit; never expose arbitrary SQL-style record patching.

## Critical relational groups

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
| Learning records | immutable learning_events(child, date, checkpoint snapshot, revision, supersedes, reason); attendance payloads |
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

Debt = approved base obligation amounts + signed obligation adjustments - effective receipt allocations - applied credits. Installment rows describe due portions and are not added as another obligation. Account balance sums all posted signed movements, including the opening movement and each original/reversing entry exactly once. Do not both remove an original movement from the sum and count its negative reversal.

Paid flags, installment state, bus settlement, progress counters, and dashboard totals are projections of canonical records. Do not maintain independently writable paidTotal, treasuryBalance, or dailyProgress values that can drift.

A transferred obligation retains original attribution and a current owner for its remaining due items. Paid source history and transferred outstanding items must not both count as new debt.

## Cross-domain service interfaces

- IdentityService.provisionAccountWithSeat(actor, input, operationId)
- ChildService.onboard(actor, familyInput, operationId) coordinates account/links/children and approved finance components.
- LearningService.publish/correct(actor, child/date scope, expectedVersion, operationId)
- BillingService.activateAgreement/generateOccurrence(actorOrJob, terms, occurrenceKey)
- PaymentService.collect/correct/refund(actor, allocations, account, expectedVersion, operationId)
- TreasuryService.postMovement/transfer/close(actor, source, operationId)
- ChildTransferService.transfer(actor, child, from/to, operationId)
- PayrollService.recordAdvance/settleMonth(actor, period, operationId)
- ImportService.preview/commit(actor, batch, expectedPreviewVersion, operationId)

These names describe responsibilities; implementation naming can follow the repo convention. All entry points must share the same invariants and authorization. Reports read canonical projections and cannot mutate source data.

## Event and job contracts

Durable events have ID, kind, installation-local scope, resource revision, safe recipient references, and created_at. Parent-facing payloads contain authorized invalidation hints, not broad row dumps. Recipient links are revalidated when reading and dispatching.

Jobs carry trusted resource IDs and an idempotency/business key. They reconstruct current rules and permissions/configuration; serialized old payloads cannot bypass later blocks. Job retry is not evidence the underlying mutation failed. Save success before acknowledging.

## Imports

Templates are versioned and use stable external keys. Parent/child template has related sheets for parents, children, and links; do not duplicate accounts per child row. Employee template may create profile-only entries or provision a login through the quota service.

Do not embed plaintext passwords in bulk templates. Create credential setup/reset results through an authorized one-time flow. Validate optional role/branch codes against delegated scope.

Opening debt import creates dated outstanding obligations with a source label and due date. It creates no receipt, income, or treasury movement. Preview and commit check current quotas, permissions, duplicates, and template version again.
