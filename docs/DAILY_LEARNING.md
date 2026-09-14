# Daily learning and configurable checkpoints

Implements R06–R07. See D14–D18 for progress defaults.

Phase 08 engine and custom-checkpoint implementation: [CHECKPOINT_ENGINE.md](CHECKPOINT_ENGINE.md), with concrete defaults D34. Phase 09 attendance implementation: [ATTENDANCE.md](ATTENDANCE.md), with concrete defaults D35. Exam, homework, and parent live-delivery work remain in Phases 10–12.

## Configuration

A checkpoint has a stable ID, built-in kind or custom kind, bilingual name, safe icon key, order, enabled flag, and immutable configuration versions. Only Superadmin changes definitions. Every branch has the same available definitions.

Default kinds are ATTENDANCE, EXAM, HOMEWORK. Custom kind is STATUS_NOTE with a selected status and optional plain-text note. No user-authored code, arbitrary HTML, custom field designer, or configurable SQL.

Each status has a stable ID, bilingual label, display order, safe theme token, progress meaning, and optional built-in outcome mapping. Names/colors are configurable; reporting relies on explicit meanings, not string comparisons.

| Checkpoint | Initial statuses | Meaning |
|---|---|---|
| Attendance | Not recorded; Present; Absent | Pending; resolved present; resolved absent |
| Exam result | Awaiting result; Result published; No exam today; Child absent | Pending; resolved result; explicit N/A; explicit N/A |
| Homework | Not assigned; Assigned/awaiting review; Completed; Not completed; Excused; No homework today | Pending; pending for due work; resolved completion; resolved noncompletion; N/A; N/A |
| Custom | Pending; Recorded; Not applicable | Pending; resolved; N/A |

A published pending status is visible but does not resolve a checkpoint. N/A resolves a reporting slot and is clearly labeled as such. Absent attendance and poor exam performance do not imply an unfinished report.

Checkpoint/status removal means retirement. Referenced IDs and versions remain intact. New configuration versions apply from the next Cairo date; reports already created retain a frozen definition set. Immediate global feature disable still prevents parent/current operational exposure.

## Daily snapshot and bar

Key a daily report by child_id + business_date. Snapshot branch/classroom attribution and applicable definition version. Generate lazily or in a bounded daily job; repeat requests cannot create duplicates.

The bar has one slot per enabled checkpoint definition. Numerator = resolved or explicitly N/A slots; denominator = enabled snapshot slots. Show the labels and state, not just color or percentage. If no checkpoints are enabled, hide the bar and explain that daily updates are off. Historical module filtering must not expose disabled data.

Do not add a slot for every exam or homework task. Each built-in checkpoint contains its detailed records. No exam today and No homework today can be published once per classroom with scoped child exceptions.

The bar is a reporting-completion indicator, not a child ranking, behavior score, or attendance percentage.

## Publication, corrections, and concurrency

Drafts are editable. A clear publish action makes a record visible immediately. Publishing saves the record, audit, notification/outbox record, and revision atomically. Use expectedVersion and a business idempotency key.

Published records cannot be overwritten or deleted through ordinary update endpoints. Correction creates a new event referencing the previous record, with required reason and actor. It becomes the effective result while preserving the chain. Teacher correction is permitted within current assigned scope; after a transfer/assignment loss a qualified manager handles it.

Homework lifecycle outcomes are also appended events. Completing an assignment does not rewrite its previously published instructions. Instruction correction produces an explicitly identified new version.

Reject stale concurrent writes; refresh the current record instead of silently replacing another teacher's work. Draft recovery is scoped and never exposes another teacher's unauthorized classroom.

## Attendance

Daily classroom roster starts unrecorded. Teacher may set several children together, then review and publish the selected roster in one operation. Bulk mark-present is an explicit teacher action, not a system inference. Explicit exceptions remain visible before confirmation.

Persist child, date, status ID/version, mapped presence, optional reason, and private audit time. Arrival/departure fields and displays do not exist. A parent's prior absence notice is an advisory separate record; it does not publish attendance automatically.

Optional absence notice: guardian selects linked child and inclusive date range with optional reason. Repeated notices are deduplicated/merged without blocking legitimate edits before teacher publication. An unexpected absence notification is created only after actual publication and only once for that effective record.

Authorized pickup is separate from attendance and does not create departure-time tracking.

## Exams

Exam definition: name, subject_id, type_id, classroom_id, assessed_on, grade_format, optional maximum_marks, creator, draft/published version. Subject and type catalogs are configurable through delegated catalog permissions. Teacher chooses a type such as oral/written/practical; labels are seed data.

Numeric format: earned marks from 0 through a positive maximum, with exact decimal handling if decimal marks are enabled. Nonnumeric format: explicit grade label/text from a configured scheme. Do not convert a label into a fabricated percentage. Comment is optional.

Results are child-specific and entered on a classroom roster. Bulk publication can publish completed rows; remaining rows remain visibly missing. Missing and absent results are not zero. Results and corrections retain the exam maximum used at the time.

For multiple published exams assessed that day, the exam slot resolves only when each applicable child result exists or is explicitly N/A. Publishing another exam can reopen the aggregate pending state through a new recorded event; prior results remain unchanged. Show which result is missing.

## Homework

Assignment: title, instructions, classroom, assigned_on, due_on, publisher, version. Initial due date defaults to the assigned date but is editable. Publishing once makes it visible to authorized guardians of the selected classroom children. Snapshot the recipients so a later transfer cannot leak another classroom's homework.

Teacher records per-child outcome: Completed, Not completed, or Excused, with optional note. Parents view the assignment and outcome; there is no parent submission, upload, or completion control.

Reporting logic:
- Homework due today remains pending until each applicable task has a recorded outcome.
- Publishing future-due homework shows Assigned for later today and resolves today's assignment-reporting requirement if no work is due today.
- On the due date, that homework becomes a pending outcome task.
- Completed and Not completed both resolve reporting; display the actual outcome plainly.
- If nothing is assigned or due, teacher can publish No homework today once for the classroom.
- An absent child does not automatically receive Not completed. Teacher may explicitly excuse applicable work.
- A transfer preserves the original assignment/branch attribution. Parent retains permitted child history; staff policy still applies.

## Custom checkpoints

Staff select a configured status and may enter a note. Support classroom-wide publication with child exceptions and individual corrections. Do not require a note by default or generate extra fields not authorized by U10.

Examples include Reading practice or Classroom activity. Their labels and statuses differ between nursery installations; no shared central catalog service is required.

## Live delivery and privacy

Parent opens a child/date view and receives authenticated SSE invalidations. Fetch authoritative data after invalidation, reconnect, focus, and a bounded fallback interval. Target visible refresh within five seconds in the baseline acceptance environment; this is a target to measure.

An open page must clear child data and show the appropriate message after account blocking, lost guardian permission, child pause, or license suspension. Do not treat a previously loaded JSON response as continuing authorization.

Parent daily view contains date-specific updates. Stable classroom/fees/subscription details live on the child overview and financial screens. No meal, photo, sleep, toilet, mood, or generic daily behavior module is introduced.

## Essential checks

Configuration version changes do not rewrite old dates; renamed statuses retain old labels in old snapshots; unknown status IDs fail validation; custom status mappings drive counts; a zero-mark exam resolves once published; absent attendance resolves correctly; no-exam bulk action is idempotent; two concurrent corrections cannot both supersede the same version; homework assignment and completion have separate histories; disabled features disappear from parent JSON and UI.
