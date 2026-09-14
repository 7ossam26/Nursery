# Verification and acceptance

The user will perform full manual review after development phases. Automated checks accompany consequential implementation so later phases do not build on broken data rules.

## Verification layers

Pure unit tests: exact money splits, due-date generation, status mapping, grade validation. PostgreSQL integration tests: permissions/scopes, concurrency, transactions, recurrences, allocation, transfer, imports, payroll. Browser checks: critical complete workflows, RTL/LTR, responsive layout, access blocking, and network recovery.

Use disposable PostgreSQL, explicit factories, fake clocks, synthetic names/phones, and controlled account roles. No production data. Do not replace transactional tests with SQLite or solely mock the service under test.

Phase checks are focused; ordinary layout/copy fixes need appropriate visual/type/build checks, not a new broad mirrored test suite. Final integration run resolves remaining cross-module risk once.

## Acceptance fixtures

| ID | Scenario | Expected |
|---|---|---|
| A01 | Branch A staff requests B child/list/export/file | Denied or correctly filtered, including aggregates |
| A02 | Teacher assigned two of four classes | Exactly those two classes and allowed children |
| A03 | One guardian links two children, another guardian links same first child | One shared child ledger; separate permitted account views |
| A04 | Cap 2, one reserved, two concurrent new parents | Exactly one creation commits; no orphan child/fee |
| A05 | Disable/archive/expire account, then Superadmin release | Reservation unchanged until explicit release |
| A06 | Existing parent session is blocked | API, SSE, exports, downloads, and visible data stop; billing continues |
| A07 | License grace boundary in Cairo; renew afterward | Correct warning/block/restore; no data or seat loss |
| A08 | Rename/add checkpoint statuses | New days change; published history retains old configuration |
| A09 | Present, Absent, N/A, zero exam score, missing score | Correct reporting meaning; missing is not zero |
| A10 | Two concurrent corrections of same result | One effective successor; original retained; stale writer informed |
| A11 | Classroom homework plus individual outcomes | Shared content, distinct child state, parent readonly |
| A12 | Daily publication then reconnect/live scope loss | Fresh permitted report; no missed permanent state or leaked events |
| A13 | Normal tuition 10,000, agreed 8,000, two children | 4,000 each; payment today independent |
| A14 | Net 100.01 EGP across three children | Exact sum; stable 33.34/33.34/33.33 allocation order |
| A15 | Monthly due day 31; short month/leap year/DST; worker retry | Valid Cairo dates and one occurrence per eligible period |
| A16 | Fixed fee 12,000 in three 4,000 installments | Debt 12,000, never 24,000 |
| A17 | Additional fee with service period | One obligation, no accidental monthly recurrence |
| A18 | Payment commit succeeds but response lost | Same operation returns original receipt; one cash entry |
| A19 | Two collectors settle same remaining amount | No over-allocation or negative remaining balance |
| A20 | Bus fee 500, attempts 250, 500, then duplicate 500 | Partial rejected; one full settlement; no duplicate cash |
| A21 | Charge 4,000; A collects 1,500; transfer 2,500 to B | No cash at transfer; later B collection yields total 4,000 |
| A22 | Transfer concurrent with payment | Debt/receipt attribution consistent under one committed ordering |
| A23 | Pending expense 1,000, later paid | No cash effect until payment; no duplicate outflow |
| A24 | Treasury internal transfer 500 | Source -500, destination +500; no income/expense |
| A25 | Refund/correction/closed date | Available amount enforced; history and closing integrity preserved |
| A26 | Salary 5,000, advance 1,000, deduction 300 | Final 3,700; total outflow 4,700 |
| A27 | Concurrent advances/deductions exceed salary together | One rejected; no negative payable |
| A28 | Repeated full salary payout; prior unpaid month | One payout per month; prior month remains separately represented |
| A29 | Opening unpaid debt import | Debt only; no fabricated collection/treasury balance |
| A30 | Import preview then quota/scope/data change; replay commit | Revalidation/conflict; atomic result; no duplicates |
| A31 | Disable finance or learning | Dependent actions/parent payloads/jobs respect settings; history retained |
| A32 | Paid trip without consent; consent without paid fee | Teacher list distinguishes both; eligibility rule enforced |
| A33 | Pickup not authorized / call not confirmed / restriction conflict | Release recording rejected; no departure-time field |
| A34 | Repeated notification job / parent finance permission removed | Deduplicated notice; no financial data leak |
| A35 | Theme mutation, 360px RTL, keyboard, reduced motion | Readable contrast, usable focus, no overflow, respectful animation |
| A36 | Offline after form input or payment submission | Data retained in memory; no offline writes; uncertain outcome resolved |
| A37 | Private document ID/path attack or malicious spreadsheet content | Scope/type/path checks and formula injection defenses hold |
| A38 | Restore backup into isolated installation | Database+files consistent; login/attachments/ledger checks pass |

## Final manual walkthrough

Superadmin creates license/capacities/theme and custom roles. Admin adds two branches, teachers/classrooms, parents/children, tuition plans, bus fees, and a trip. Teacher publishes attendance/exam/homework and a correction. Parent sees live updates and permitted balances. Finance collects installments, records expense/advance/salary, transfers a child with debt, closes cash, exports PDF/Excel. Admin blocks/unblocks a parent. Test a second language and narrow mobile width. Finally review import preview and a sandbox restore.

Manual results are not pre-marked passed. Maintain an evidence table with scenario, build/commit, environment, command or steps, result, and issue link.

## Performance and reliability targets

Initial engineering targets, to measure on the actual VPS: typical paginated reads p95 under 500ms server-side, non-export mutations p95 under 1s, visible live updates within 5s under healthy network. Use a configurable moderate fixture (for example 2 branches, 300 children, 50 staff) and report the real environment/concurrency. These are not promises about the unspecified VPS.

Measure query plans for balances/attendance/guardian history, eliminate N+1 queries, bound import/export batches and worker concurrency, and test restart recovery. If a target fails, identify a concrete bottleneck before adding infrastructure.

## Evidence rules

Actual commands replace planned command names once Phase 01 establishes them. Capture concise relevant output. A failed test cannot be marked skipped to pass a gate. Missing credentials/infrastructure are recorded as not run. Do not claim live deployment, restore success, performance, or visual verification without evidence.

Phase21 A29/A30/A03/A04/A37 evidence: real PostgreSQL imports suite plus Phase3/5/18/19/20 upgrade/rerun 12/12, bilingual real-HTTP/DOM imports 3/3, regression of the refactored onboarding/ledger/payroll/assignment services (63 integration, 12 DOM), focused units, workspace lint/type/build and diff check passed; exact commands, corrected defects and limits are in [IMPORTS.md](IMPORTS.md). No browser automation or live database was used.

Phase19 A26/A27/A28/A01/A05 evidence: final PostgreSQL payroll/actual upgrade-rerun15/15, financial regression checkpoint45/45, final real HTTP/DOM payroll/shared-operation regression8/8, focused units3/3 and workspace lint/type/build passed. Independent source/cash/cap/final-equation reconciliation is included in the repository fixtures. Exact commands, earlier failed attempts/fixes, runtime mismatch and unverified visual/deployment/performance limits are recorded in [EMPLOYEE_PAYROLL.md](EMPLOYEE_PAYROLL.md); no browser automation or live database was used.
