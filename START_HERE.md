# Nursery application — Codex implementation plan

Planning baseline: 13 September 2026. Language: English. Product UI: Egyptian Arabic and English. Status: planning complete; application implementation has not started.

The answers now define the V1 well enough to proceed. Remaining routine choices are recorded as explicit defaults in [DECISIONS.md](docs/DECISIONS.md), so Codex can work consistently and you can revise a choice without guessing what was assumed.

## What this package contains

- Canonical product requirements, business rules, architecture, security, UX, and operational specifications.
- **25 separate implementation phases**, each with its own Markdown file, scope, model recommendation, acceptance gate, and copy-and-paste Codex prompt.
- Small persistent state/handoff files and reusable resume, fix, and change-request prompts.
- Requirement-to-phase/test mapping and verified primary-source references.

The phase count reflects useful implementation boundaries. It is not a promise that one phase fits one conversation or a fixed token allowance. A phase can span several sessions and should finish its acceptance gate before the next starts.

## How to use this in Codex

1. Create your project folder/repository. Extract the package contents into its root so AGENTS.md, docs/, phases/, and prompts/ are directly inside the repository. There is no application code to merge yet.
2. Read [PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) and the explicit defaults in [DECISIONS.md](docs/DECISIONS.md). Your later instructions take precedence; record an intentional change in the decisions file.
3. Open this repository in Codex. Select **Terra / Medium** for Phase 01, then open [Phase 01](phases/PHASE_01_repository_foundation.md) and paste its final prompt into Codex.
4. Let Codex implement only that phase, run its actual checks, and update PROJECT_STATE.md and HANDOFF.md. Review its result before you start the next numbered phase.
5. For each subsequent phase, select the recommended model yourself, then paste that phase's prompt. Keeping files in the repository avoids repeatedly pasting the full specification.
6. If context runs low or you open a fresh session, use [RESUME.md](prompts/RESUME.md). For defects use [FIX.md](prompts/FIX.md); for a changed requirement use [CHANGE_REQUEST.md](prompts/CHANGE_REQUEST.md).
7. After all phases, run the user acceptance walkthrough generated in Phase 25. Phase 24 supplies actual automated/integration evidence; your final hands-on review remains valuable.

Do not paste all 25 prompts into one task. Codex should not treat the complete plan as authorization to implement every phase at once. A model name inside a prompt does not change Codex's active model.

## Phase index

| Phase | Deliverable | Model | Reasoning |
|---|---|---|---|
| 01 | [Repository, tooling, and shared contracts](phases/PHASE_01_repository_foundation.md) | Terra | Medium |
| 02 | [Bilingual design system and navigation](phases/PHASE_02_bilingual_design_system.md) | Sol | High |
| 03 | [Authentication, sessions, and account security](phases/PHASE_03_authentication_sessions.md) | Astra | High |
| 04 | [Branches, classrooms, and dynamic permissions](phases/PHASE_04_branches_roles_scopes.md) | Astra | High |
| 05 | [Superadmin, subscriptions, slots, and nursery settings](phases/PHASE_05_superadmin_licensing_settings.md) | Sol | High |
| 06 | [Children, guardians, onboarding, and documents](phases/PHASE_06_children_guardians_onboarding.md) | Sol | Medium |
| 07 | [Health notes, authorized pickup, and incidents](phases/PHASE_07_health_pickup_incidents.md) | Terra | Medium |
| 08 | [Versioned checkpoints and publication engine](phases/PHASE_08_configurable_checkpoint_engine.md) | Astra | High |
| 09 | [Attendance and daily classroom reports](phases/PHASE_09_attendance_daily_reports.md) | Sol | Medium |
| 10 | [Exams, grades, and corrections](phases/PHASE_10_exams_results.md) | Sol | Medium |
| 11 | [Homework assignments and individual completion](phases/PHASE_11_homework_completion.md) | Sol | Medium |
| 12 | [Parent hub, announcements, and live notifications](phases/PHASE_12_parent_hub_notifications.md) | Sol | High |
| 13 | [Financial records, transactions, and treasury core](phases/PHASE_13_financial_core.md) | Astra | High |
| 14 | [Billing modes, equal discounts, and recurring charges](phases/PHASE_14_billing_discounts_recurrence.md) | Astra | High |
| 15 | [Collections, outstanding balances, receipts, and manual blocks](phases/PHASE_15_collections_receipts_access_blocks.md) | Sol | High |
| 16 | [Expenses, transfers, refunds, and daily closing](phases/PHASE_16_expenses_corrections_closing.md) | Sol | High |
| 17 | [Child branch transfer and outstanding debt ownership](phases/PHASE_17_child_branch_debt_transfer.md) | Astra | High |
| 18 | [Bus subscriptions, trips, and participation](phases/PHASE_18_bus_trips_activities.md) | Terra | Medium |
| 19 | [Employee financials and monthly payroll](phases/PHASE_19_employee_payroll.md) | Sol | High |
| 20 | [Management reports and PDF/Excel exports](phases/PHASE_20_reports_pdf_excel.md) | Terra | Medium |
| 21 | [Excel templates, validation preview, and atomic import](phases/PHASE_21_excel_imports.md) | Astra | High |
| 22 | [PWA, network recovery, and usability hardening](phases/PHASE_22_pwa_network_accessibility.md) | Sol | Medium |
| 23 | [Dokploy deployment assets, backup, restore, and support](phases/PHASE_23_dokploy_backup_support.md) | Sol | High |
| 24 | [Cross-module verification and release fixes](phases/PHASE_24_integration_release_verification.md) | Astra | High |
| 25 | [Operator guides, user walkthrough, and final handoff](phases/PHASE_25_operator_user_handoff.md) | Luna | Low |

Use the nearest available reasoning label in your client. [MODEL_AND_CONTEXT_GUIDE.md](docs/MODEL_AND_CONTEXT_GUIDE.md) explains the recommendations and escalation rules without inventing token budgets.

## Canonical reading map

| Document | Use |
|---|---|
| [PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | V1 scope and exclusions |
| [DECISIONS.md](docs/DECISIONS.md) | Explicit user choices versus reviewable defaults |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, module boundaries, repository layout |
| [ACCESS_AND_LICENSING.md](docs/ACCESS_AND_LICENSING.md) | Branch/classroom privacy, reserved slots, blocks, settings |
| [DAILY_LEARNING.md](docs/DAILY_LEARNING.md) | Configurable checkpoints, live publication, grades/homework |
| [FINANCE_RULES.md](docs/FINANCE_RULES.md) | Billing, equal discounts, collections, transfer, treasury, payroll |
| [API_AND_DATA_CONTRACTS.md](docs/API_AND_DATA_CONTRACTS.md) | Shared contracts and database invariants |
| [UX_AND_BRANDING.md](docs/UX_AND_BRANDING.md) | Simple layouts, palette, contrast, Egyptian Arabic |
| [TESTING_AND_ACCEPTANCE.md](docs/TESTING_AND_ACCEPTANCE.md) | 38 consequential acceptance scenarios |
| [OPERATIONS.md](docs/OPERATIONS.md) | Dokploy, independent installations, backup/restore |
| [TRACEABILITY.md](docs/TRACEABILITY.md) | Requirements, phases, tests, original-scope changes |
| [REFERENCE_SOURCES.md](docs/REFERENCE_SOURCES.md) | Primary technical/model sources |
| [PROJECT_STATE.md](docs/PROJECT_STATE.md) / [HANDOFF.md](docs/HANDOFF.md) | What has actually happened and what comes next |

## Important resolved meanings

**Billing arrangement** means recurring monthly, fixed term/year with installments, or a separate one-time/additional charge. An additional charge may carry a service period without repeating. A payment method, such as cash or bank transfer, describes how money was collected externally; it is a separate field.

**Paid** is derived from a recorded receipt and allocation. A checkbox cannot create a paid state without the corresponding financial transaction. Recurring charge generation creates debt, never cash.

**Enrollment** simply means a child's registration with a branch/classroom and active/paused/left status. It is separate from the parent's login and the child's financial agreement; it does not introduce a new admissions module.

**Daily completion** tells the parent whether an update was recorded, not whether the child performed well. Absent attendance or a low grade can be a completed update. Homework assignment and individual outcomes have separate records.

**Application blocking** is a deliberate admin action. Overdue notices do not automatically block parents, and a blocked/deactivated account does not free a purchased slot or cancel its child's billing.

**Superadmin** manages the currently deployed nursery, including technical/commercial settings and management tools. A central dashboard for all independently deployed customers is outside this V1.

## Delivery status and next action

This package defines the work. It does not contain built screens, executed application tests, or a deployed nursery. Phase 01 creates the actual workspace and verified commands.

Next action: open [Phase 01](phases/PHASE_01_repository_foundation.md), select its model, and paste its prompt into Codex.
