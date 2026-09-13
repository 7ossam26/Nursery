# Product requirements — confirmed V1

Baseline: 2026-09-13. This document consolidates Nursery_Management_Business_Requirements_V1.md with the user's subsequent answers. Later answers supersede the attachment. Technical defaults are identified in DECISIONS.md.

## R01 — Product and deployment

A nursery operations, learning-progress, parent-notification, and practical finance website for Egypt. Each independent customer gets its own deployment, database, private files, branding, and local Superadmin area from the same codebase. Multiple branches belong to that one nursery. A future shared SaaS product and React Native client are future work; retain modular services and reusable API contracts.

The developer is Superadmin inside each installation and can access the nursery's administration tools plus licensing, account limits, roles, branding, support, audit, backup, and controlled recovery tools. There is no central cross-nursery customer service or automated provisioning platform in V1.

## R02 — Users, access, and licensing

Username and password login. Admin creates parent and employee accounts. Password recovery is performed by Superadmin after external contact; there is no SMS/email reset workflow. Store hashes, never retrievable passwords.

A parent can have several children and a child can have several separately authenticated guardians. Permissions on each child/guardian link support restricted access and custody cases; administration has final authority. The combined employee-plus-parent identity case is deferred.

Staff can be assigned multiple branches. Teachers see only their assigned classrooms within those branches. Moving a staff member changes future authorized access while preserving historical attribution.

Superadmin defines custom roles and permissions; the nursery admin assigns the available roles and manages normal staff accounts and assignments. Sensitive financial correction is a separate Superadmin-controlled user entitlement in addition to the necessary permission and scope.

Subscriptions are monthly or annual and managed manually by Superadmin. Store validity dates, a configurable grace period, optional commercial amounts/notes, and independent purchased parent and employee limits. Count reserved account slots, not active logins. Two guardian accounts reserve two parent slots; one guardian with several children reserves one. Every staff login, including the nursery administrator, reserves an employee slot; Superadmin is excluded. Temporary or permanent ordinary deactivation and child archival never free slots. Only explicit Superadmin account removal/slot release does.

Admin can block or unblock a parent account, optionally until a date, with a public contact-nursery message and an internal reason. Blocking does not cancel fees. Existing sessions and live connections lose access promptly. Account blocks, child pauses, and installation license suspension have distinct reasons and effects.

Commercial pricing is managed in Superadmin against purchased parent/employee capacities for the chosen subscription period, with explicit agreed amounts and manual external renewal payment records. These platform subscription records are separate from child fees and branch treasury; detailed pricing defaults are in D28.

## R03 — Configurability

One shared feature configuration for every branch. There are no branch-specific module overrides or per-child feature switches in V1. Role permissions, classroom scope, guardian permissions, and individual bus subscriptions still differ.

Nursery admin controls ordinary module availability, calendars, fee arrangements, operational catalogs, and notifications. Superadmin controls technical and commercial settings, themes, role definitions, sensitive-edit grants, and checkpoint definitions/statuses.

Optional modules: child attendance, daily learning, homework/exams within learning, authorized pickup, health notes, incidents, announcements, finance, transport subscriptions, activities/trips, payroll, and the associated reports. Shared activities can also be recorded using custom status-and-note checkpoints.

Required identity fields and integrity/security controls remain mandatory infrastructure. Disabled functionality disappears from normal navigation, parent responses, tasks, and reminders. Existing data is retained; authorized administrative history and support controls remain available under the explicit dependency rules.

## R04 — Usability and presentation

Responsive website and installable PWA. Parent-facing simplicity is a primary selling requirement: readable fonts, clear grouping, few navigation destinations, visible labels with icons, large touch targets, light colors, and short icon animations. Follow the supplied desktop/mobile layout references as inspiration, not their hotel/parking content.

English and Egyptian Arabic with RTL. Use EGP, Latin digits, and dd/MM/yyyy display as the documented initial formatting default. Internal code/docs remain English. Support per-user language choice.

Default accents: #F13E93, #F891BB, #F9D0CD, #FAFFCB. Superadmin can change nursery-wide colors and branding. Additional neutrals and semantic status colors are required; contrast takes priority. See UX_AND_BRANDING.md.

## R05 — Parent/child onboarding and records

Use a guided onboarding flow: parent account, one or more children, classroom/branch, fee agreements/discounts/installments, bus subscription, and any actual payment. Only enabled steps appear.

Parent required fields: full name, mobile, username, initial password. Child required fields: full name, date of birth, branch; classroom is required before activating classroom operations. Contact relationship and secondary contacts can be recorded. Documents are optional generic named files with an optional expiry date; there is no mandatory predefined document checklist. Logos and private administrative documents remain supported despite deferring daily media sharing.

Children have Active, Paused, and Archived/Left statuses. Paused children show the parent a contact-nursery message and leave daily rosters; archived records are retained for management. An active sibling remains accessible. Classroom transfer preserves old history. Branch transfer additionally follows R13.

Classrooms have age groups, capacity warnings, teacher/assistant assignments, and occupancy counts. These assignments never imply employee attendance or hours.

## R06 — Configurable daily checkpoints

Superadmin creates, orders, enables, and configures checkpoints and their statuses. Defaults are Attendance, Exam result, and Homework. Newly created checkpoints collect a configurable status and an optional note. A generic form builder is excluded.

Each child's daily page has a live progress bar and a chronological history. Publishing a record changes the corresponding checkpoint immediately for authorized parents. The bar records reporting completion, not academic achievement. Published entries are immutable; corrections create a reasoned replacement event retaining the original. Teachers may correct records within their classroom authority.

Status definitions include safe internal meaning: pending, recorded/resolved, or not applicable. Attendance additionally maps custom statuses to present/absent/not recorded. Historical dates retain their original configuration and labels.

## R07 — Attendance, exams, and homework

Attendance is one classroom roster task, with bulk entry and explicit publication. Record Present or Absent using configurable statuses; an absence reason is always optional. The day and technical audit time are stored, never child arrival/departure times. Unrecorded attendance is not inferred as absence. Optional planned absence notices retain a date range and optional reason; a teacher still confirms attendance.

Exam records contain exam name, subject, type, grade, and optional comment. Teacher chooses an exam type. For numeric grades record earned and maximum marks; the plan also provides an explicit nonnumeric grade format without inventing numeric averages. Enter results from one classroom roster. Missing results are not zero.

Teachers publish homework to a classroom and record completion separately for each child. Parents view the assignment and recorded outcome; parents do not submit files or mark completion. Shared assignment content is entered once.

## R08 — Safety and health

Authorized pickup records contain name, phone, and relationship. Parents manage their permitted child's authorized people; management can restrict access and record prohibited collectors. Support one-day authorization, date-only pickup records, and staff confirmation that the guardian was called before release. Require an authorized collector and confirmed call; unresolved restriction conflicts prevent recording a release. The app records the procedure and cannot physically verify a caller's identity.

Health is limited to notes, allergies/alerts, and emergency contacts. Keep data visible only to appropriate staff and linked guardians. No medication administration, dose schedules, or medical decision-making.

Incident reports contain child, date/time, description, action taken, guardian informed status, external contact method, and follow-up. Notify the parent in-app. Calls/WhatsApp may handle the real-world follow-up. No injury-photo workflow in V1.

## R09 — Official communication

In-app announcements target the nursery, branches, classrooms, selected parents, or a child. Support optional acknowledgment for important announcements, holiday notices, absence notices, overdue notices, trips, and incident updates.

A WhatsApp link opens a chat with the relevant parent's normalized phone number. The app does not send WhatsApp messages, SMS, email, or native push notifications. Publication and notification delivery are different: parents see committed data even if a live refresh is interrupted.

## R10 — Billing arrangements

Every nursery can use all three arrangements:
1. Recurring monthly fee: automatically generate the next charge for an active agreement.
2. Fixed term/year fee: record the agreed total with configured installment amounts and due dates.
3. Additional fee: a distinct one-time obligation, optionally labeled with its own service period. A period label alone never creates recurrence.

Fee categories can include tuition, registration, books, uniforms, bus, trips, and other manually agreed charges. An extra-hours amount is manually entered; no hours tracking is added. Collection methods describe money received outside the app, such as cash, bank, InstaPay, or wallet.

## R11 — Discounts and collection

During onboarding, Add Discount accepts the final agreed tuition total and shows the difference from normal tuition. It is not today's payment amount. Split the final agreed amount equally between the included children. EGP 10,000 normal tuition, EGP 8,000 final agreement, two children: EGP 2,000 family discount and EGP 4,000 obligation per child.

Record full payments or installment payments and calculate what remains. Show all outstanding accounts, future due amounts, overdue amounts, collection history, and A4 receipts. Overdue notification goes to authorized management and the parent. Access blocking remains a deliberate admin decision.

Payments are recorded by authorized staff after collection outside the app. No gateway or transfer-proof approval workflow. One child's two guardians see the same child ledger subject to link permissions, never duplicated charges.

## R12 — Treasury, expenses, and adjustments

Each branch is coded and linked to its default treasury. Each treasury/account has a code, type, and branch. Actual receipts enter the appropriate account; creating an account or fee agreement does not fabricate a payment.

Track pending expenses, pay them when actually spent, categories, documents, daily cash closing, counted balances, shortages/surpluses, and optional large-expense approval. Support transfers between accounts, reasoned financial corrections, refunds, and explicit credits. Internal transfers are excluded from income and expense totals.

The practical monthly result is actual parent collections minus refunds and actual operating outflows, with separately explained other income. Unpaid fees and unpaid expenses appear separately. It is not statutory accrual accounting or a tax ledger.

## R13 — Branch transfer

Paid transactions stay attributed to the old branch. Remaining debt moves with the child to the destination branch, keeping due dates, source documents, and an audit record of the amount and both branches. Future collection enters the destination treasury. There is no cash movement at transfer time.

## R14 — Bus and trips

Bus: record subscription, fee period, amount, payment state, and permission to use the bus. Each bus charge is paid in full or unpaid; partial bus settlement is rejected. No routes, tracking, boarding/dropoff events, or bus attendance module.

Trips/activities: admin creates an event and selects children whose parents are notified. From a child's record or event roster, authorized staff record payment and externally obtained permission. Teachers see clear paid/permitted/participating states for children within their scope. Cancellation supports a reasoned credit/refund through finance. No payment gateway or parent approval workflow is required.

## R15 — Employee financials and payroll

Each employee has an agreed monthly salary. During the month enter authorized bonuses/additions, deductions/penalties, and salary advances. The current month's advances and deductions cannot exceed the basic salary; payment of the remaining amount occurs once in full. There is no partial final payout or automatic carry of adjustments between months.

Advance cash leaves the treasury when issued. The final salary pays only the remainder. Preserve previous monthly records and unpaid status without automatically folding them into a new month. No attendance, biometric, timesheet, leave, contract, recruitment, tax, or social-insurance calculation module.

## R16 — Reports, import/export, and operation

Financial/operational reports cover the retained modules: collections, spending, balances, overdue dates, cash movements, payroll, children, classroom capacity, attendance, exams, homework, bus subscribers, trips, incidents, and document expiry. Remove reports for excluded modules.

A4 PDF receipts and PDF/Excel exports. Initial Excel import templates: parents/children, opening unpaid child balances, employees/basic salaries. Provide validation preview and clear row errors. Imported debts are not cash receipts.

Online-only data operations. Show a connection problem modal, preserve entered form data in memory, and resolve uncertain payment outcomes safely. No queued offline writes. Installable PWA caches only safe shell assets.

Deploy on the user's Hostinger VPS with Dokploy. Provide a repeatable installation, backup/restore, upgrade, and support runbook; do not invent VPS capacity. Final user-led manual acceptance follows the phases, with focused automated verification during development.

## R17 — Explicit V1 exclusions

Camera access/streaming; AI features; internal chat; complaints/inquiries including staff-only logs; meeting requests; admissions leads/waiting lists; media albums/photos; meal/sleep/toilet/mood/behavior trackers; medication workflows; full HRM/employee attendance; bus attendance/routes/GPS; online gateways/payment-proof upload flows; automatic attendance-based fees or payroll; automatic late penalties; complex tax/statutory accounting; native apps; shared SaaS tenancy; central multi-customer dashboard; offline writes; unrestricted custom checkpoint fields.

Generic custom status-and-note checkpoints are supported, but do not build specialized excluded modules under another name.
