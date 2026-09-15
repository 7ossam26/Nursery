# Requirement and implementation traceability

This maps the consolidated V1 to implementation phases and consequential checks. A reference in this table is planned coverage, not evidence that a feature or test has been implemented.

## Consolidated requirements

| Requirement | Main phases | Acceptance coverage |
|---|---|---|
| R01 Separate installations and local Superadmin | 01, 05, 23 | A07, A38; deployment isolation review |
| R02 Accounts, dynamic roles, scopes, licensing, reserved slots | 03–06, 15, 22 | A01–A07, A30, A34 |
| R03 Nursery-wide feature configuration and settings ownership | 04, 05, 08, 22 | A08, A31, A35 |
| R04 Simple bilingual responsive UX and configurable theme | 02, 12, 15, 22 | A35, A36; A4 rendering checks |
| R05 Family onboarding, generic files, classrooms, lifecycle | 04, 06, 14, 15, 17 | A01–A06, A13, A21, A37 |
| R06 Configurable live daily checkpoints and immutable history | 08, 09, 12 | A08–A12, A31 |
| R07 Attendance, exam grades/types, teacher-managed homework | 09–11 | A02, A08–A11 |
| R08 Limited health, authorized pickup, incidents | 07 (implemented, see SAFETY.md), 12 | A01, A03, A31, A33, A37 |
| R09 Announcements, notices, acknowledgments, WhatsApp links | 07, 12, 15, 18 | A12, A32, A34 |
| R10 Three billing arrangements and monthly charge generation | 13, 14 | A13–A17, A29 |
| R11 Agreed tuition discount, collections, reminders, manual block | 14, 15, 22 | A06, A13–A20, A34, A36 |
| R12 Treasury, expenses, refunds, credit, closing | 13, 15, 16, 20 | A18, A19, A23–A26 |
| R13 Outstanding debt follows branch transfer; old cash stays | 17, 20 | A21, A22 |
| R14 Bus full settlement and trip permission/payment roster | 18 | A20, A31, A32 |
| R15 Fixed monthly salary, advances/deductions, full final pay | 19, 20 | A26–A28 |
| R16 Reports, templates/import, PWA, operations, final acceptance | 20–25 | A29–A38 |
| R17 Explicit exclusions | All phases; audited in 24 | Scope review; no excluded module routes/tables/workflows |

## Original attachment reconciliation

Input: Nursery_Management_Business_Requirements_V1.md. The latest conversation answers override that original document where they differ.

| Original area | Consolidated disposition |
|---|---|
| Product vision and low staff workload | Retained; classroom shared input and parent clarity remain priorities |
| Configuration at many granular levels | Nursery-wide module availability shared by all branches; user/resource permissions remain separate |
| Multiple children and child dashboard | Retained; multiple guardians allowed without duplicate debt |
| Optional end-of-day summary and broad daily fields | Replaced by live configurable checkpoints; default Attendance, Exam result, Homework |
| Meals, sleep, toilet, mood/behavior, daily media | Specialized workflows excluded; do not revive through seed modules |
| Child attendance and planned absence | Retained with optional reason, explicit publication, no arrival/departure fields |
| Authorized pickup | Retained with phone/relationship, restrictions, date validity, and recorded guardian call confirmation |
| Parent finance and collection evidence | Financial visibility retained; payments collected externally and entered by staff; no proof-upload approval flow |
| Announcements and acknowledgment | Retained with in-app delivery and external WhatsApp chat links |
| Complaints/inquiries, including staff-only logging | Removed by the later explicit user decision |
| Parent approvals/requests | Retain only relevant pickup/absence/announcement interactions; trip consent recorded by staff externally |
| Admissions/waiting list | Excluded; ordinary family onboarding remains |
| Health/medication | Notes, allergy alerts, emergency contacts retained; medication workflows removed |
| Incidents/injuries | Simple record, action/follow-up, external contact and notification retained; no injury photos |
| Classroom/capacity | Retained; capacity warnings and teacher assignment |
| Activities/trips/meals/events | Trips/activities retained; specialized meal workflow excluded |
| Transportation | Subscription fee and permission retained; route/GPS/boarding/bus attendance excluded |
| Revenue/expenses/treasury/corrections | Retained with exact money, actual cash events, manual authorization, audit and clear account attribution |
| Payroll | Simplified fixed salary plus monthly adjustments/advances; no HR attendance, proration, or automatic carry |
| Reports and settings | Retained only for implemented V1 areas |
| Camera/AI/chat/full HRM | Remain excluded |

## Conversation refinements requiring special care

- Deployment independence does not mean one branch per deployment: each nursery can have several branches.
- The local Superadmin manages nursery details, support and commercial settings, and can use management tools; there is no central multi-customer console in this release.
- Parent and employee capacities are separate purchased allowances. Inactivity does not release reservations.
- A guardian with siblings consumes one login slot; two separate guardian logins consume two.
- Published daily records are preserved. Corrections and homework transitions append history.
- New checkpoints accept status plus optional note. Configurable labels must map to explicit reporting semantics.
- Agreed discounted tuition is split equally, including deterministic rounding; do not substitute a proportional formula.
- Monthly charge creation is automatic. Collection remains a separate manual record of actual money.
- Additional fees remain separate even when labeled for a period; period labels alone never cause repetition.
- Bus fees and final salary settlement are all-or-nothing; partial tuition collection follows the documented default.
- Outstanding debt ownership changes at branch transfer; paid source receipts and treasury balances do not move.
- Admin blocking is manual, with nursery-contact messaging; it neither cancels billing nor frees a slot.
- Health remains limited, and complaints remain removed despite the earlier staff-only selection.
- Feature configuration and branding are shared across branches. Permission grants still vary by user.

## Build evidence to add later

Phase 24 fills ACCEPTANCE_EVIDENCE.md with the actual build, environment, scenario/command, result, and issue link. Phase 25 creates the user-led walkthrough. This file must not be used to imply those checks already passed.

Phase24 execution evidence is now recorded in [ACCEPTANCE_EVIDENCE.md](ACCEPTANCE_EVIDENCE.md), with explicit partial/manual/blocked distinctions and release issues in [KNOWN_ISSUES.md](KNOWN_ISSUES.md). R04/R06/R07 release fixes restore A02/A09/A10 roster reachability beyond100 children and remove the measured repeated attendance-query bottleneck (D52). No new V1 feature or schema migration is introduced. See the evidence document for the current gate result; this mapping alone still does not establish acceptance.

Phase25 creates [USER_GUIDES.md](USER_GUIDES.md) (role-based operator guides) and [USER_ACCEPTANCE_WALKTHROUGH.md](USER_ACCEPTANCE_WALKTHROUGH.md) (the manual scenario referenced above, with blank result fields and every open Phase24 issue carried forward). It documents only; A01–A38 acceptance itself still requires the tech lead to execute that walkthrough and record real results.

For each future requirement change, update this mapping, DECISIONS.md, relevant domain specifications, and affected unexecuted phase files.
