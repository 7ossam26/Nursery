# Access, licensing, and feature controls

Implements R01–R03, R05, U01–U05. Defaults D03–D05 and D19 are explicit.

## Identity and authorization

Reserve three account kinds: SYSTEM, STAFF, GUARDIAN. These identify infrastructure/seat treatment; business role names remain editable records. No shared staff/guardian account in V1.

A request is allowed only if the account/session is valid, the installation is usable for that action, the feature is enabled, the capability is granted, and all resource scopes pass. Superadmin is the reserved SYSTEM identity for that installation; it has administrative/support authority but still uses audited, invariant-preserving services.

Do not check username or editable role name to identify Superadmin. Do not authorize solely by hiding buttons. Reject mass assignment of system kind, sensitive-edit grants, extra branches, or role capabilities.

Examples of stable capabilities: users.create_parent, users.manage_staff, users.assign_roles, parents.block, children.manage, guardians.manage, attendance.publish, learning.correct, exams.publish, homework.publish, health.read, incidents.manage, pickup.record, billing.manage, payments.record, finance.correct, treasury.close, payroll.pay, reports.read, imports.commit. Superadmin alone controls roles.define, licensing.manage, seats.release, support.restore, and sensitive grant assignment.

Admin can assign only roles explicitly delegated by Superadmin. It cannot edit role definitions or grant reserved capabilities. Multiple role capabilities combine; assignments and per-child guardian limits still restrict access. A sensitive financial correction needs finance.correct AND the Superadmin-granted sensitive_financial_edit flag AND resource scope.

## Scope rules

- Branch manager: only assigned branches, including lists, totals, options, files, and exports.
- Teacher: intersection of assigned branches and assigned classrooms. A classroom must belong to an assigned branch. Several classroom assignments are supported.
- Guardian: linked children only, with link-level read/finance/pickup/notification permissions and management restrictions.
- Staff history: original record branch remains authoritative. Source staff retain authorized old records with identifying snapshots; destination staff see transferred current obligations and current child records, not unrelated original-branch data.
- A guardian can view their permitted child's history across that child's branches. This never grants branch-wide access.
- Multi-branch dashboards show an explicit selected scope; server aggregation cannot silently include other branches.
- A branch-limited admin can globally block a parent only when authorized over all linked active child branches. Otherwise require appropriately scoped administration; do not reveal inaccessible siblings in the error.
- Changing assignments revokes old effective access promptly. Existing SSE streams, export links, browser caches, and file downloads cannot retain broader access.

Guardian links are independent. Blocking one guardian account does not block another guardian for the same child. Pausing one child does not remove access to an active sibling.

## Reserved account slots

Tables: license_limits, seat_reservations, accounts, account_status_history. An unreleased reservation consumes one slot even if the account is blocked, temporarily disabled, archived, or not currently logging in.

Allocation transaction locks the relevant limit row and computes active reservations. Creating accounts and their reservations is atomic. Parent onboarding/import with insufficient seats fails without leaving orphan accounts, children, or charges. Count accounts, never child links. Account kind cannot be changed to bypass limits.

Superadmin can increase limits manually. Reducing a limit below reservations is rejected until an explicit reviewed release is performed. Release disables the account and revokes sessions; it does not cascade-delete child/financial/audit history. Restoring an account needs a new available reservation. Release/reallocation is auditable and idempotent. Ordinary delete/archive buttons cannot release seats.

Acceptance race: cap 2, reserved 1, two concurrent creations → exactly one succeeds and reserved becomes 2. Temporary disable → reserved still 2. Superadmin release → reserved becomes 1. One guardian linked to two children remains one reservation.

## Subscription and blocking

Installation license fields: subscription type, starts_on, valid_until, grace_days, commercial note/amount, support details. Dates are Cairo business dates; valid_until is inclusive. Initial grace is 7 configurable days. All changes are audited.

Commercial settings record purchased parent and employee capacities and separate unit prices for the selected monthly/yearly subscription period. Show the capacity-based estimate and any explicitly agreed total override/reason. Superadmin records external renewal payment/status manually; there is no gateway, automatic collection, or implicit mid-period proration when limits change. Customer platform subscription records are separate from child tuition and branch cash accounts.

During grace, staff see a renewal warning. Once business date exceeds valid_until + grace_days, normal nursery access is suspended; only a minimal contact/support response is available. Superadmin can renew/support/backup. Renewal restores eligible accounts without deleting history or changing slots.

Parent manual block stores active flag, optional inclusive until-date, public message, internal reason, actor. Ended temporary block restores eligibility automatically, without seat release. Overdue reminders never set this flag. A parent block does not stop recurring fees. Existing issued fees survive all access changes.

License suspension is an access state, not financial cancellation. Billing jobs can continue active agreements while finance remains enabled; notifications remain stored without external sending. Paused/ended billing agreements and disabled finance are handled separately.

## Settings ownership

| Setting | Owner |
|---|---|
| License, separate account limits, explicit seat release | Superadmin |
| Role definitions/delegation, sensitive grants, support operations | Superadmin |
| Nursery brand/theme, checkpoint/status definitions | Superadmin |
| Module availability, calendar, catalogs, fee agreements, notification options | Authorized nursery admin; Superadmin also has access |
| Staff roles/branches/classrooms from delegated options | Authorized nursery admin |
| Per-child guardian restrictions and parent blocking | Authorized administration |
| Personal language | Signed-in user |

One module setting applies across every branch. Branch data, staff assignments, and subscriptions differ independently.

## Dependencies and disabled behavior

Core identity, authorization, audit, data integrity, and child identifiers cannot be switched off. Optional forms can omit nonessential fields.

Finance is required for payroll settlement, paid transport, paid events, collections, treasury reports, and monetary imports. Disabling finance pauses new generation and disables dependent paid operations; existing data is retained. Free announcements/activities and ordinary child operations can continue. Show the dependency impact before saving settings.

Phase19 adds PAYROLL with explicit FINANCE dependency copy. Both modules gate new payroll profile/salary/snapshot/adjustment/advance/settlement/login actions; authorized finance.read branch-wide history remains readable. `payroll.manage` and `payroll.pay` are separately delegable, with no automatic role grants or classroom/guardian fallback. Profile-only employees reserve no login slot; optional STAFF login at creation or later uses LicensingService atomically and requires users.manage_staff as well as payroll.manage. Financial profile deactivation never changes account status or frees a reservation. See D47 and [EMPLOYEE_PAYROLL.md](EMPLOYEE_PAYROLL.md).

Daily learning depends on configured enabled checkpoints. Attendance/exams/homework may be switched off independently; disabled checkpoints create no parent fields or staff tasks. Parent responses must omit disabled data, including old daily details; authorized administrative history remains available.

Re-enabling a feature restores existing history. New daily snapshots use the applicable configuration version. For finance re-enable, show missing service periods for explicit admin catch-up approval; do not silently invoice periods while the module was intentionally off.

Existing health data on disable remains accessible through an authorized staff emergency-information panel and audit history, as documented D26/R08; parents lose the disabled optional section. Make this effect explicit in the disable action. No new health-entry tasks are generated. Disabling authorized pickup or incidents (D33) likewise stops new authorizations, restrictions, releases, reports and follow-ups with a distinct MODULE_DISABLED response while authorized staff keep reading existing history; parent sections disappear.

## Support safety

Audit support access and actions. Password reset generates a new temporary password, displays it once to the operator for external delivery, revokes sessions, and requires change at next sign-in. Never display original passwords.

Support deletion must preview dependent records and preserve necessary financial/audit history. Backup/restore uses fixed validated job types, never arbitrary shell/SQL from a browser. Restore details are in OPERATIONS.md.
