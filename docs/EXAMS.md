# Exams, grades, and corrections

Phase 10 implements R07/U12 exam behavior on the Phase 08 checkpoint engine, reusing the EXAM checkpoint definition seeded in migration `0006_learning.sql` (Awaiting result / Result published / No exam today / Child absent). It does not add AI grading, curriculum planning, parent submissions, or destructive editing of published grades.

## Catalogs and exam definitions

`GET /api/v1/exams/catalog` returns nursery-wide `subjects` and `exam_types` (id, name, enabled, version); staff need `learning.read`. `POST`/`PUT /api/v1/exams/catalog/{subjects|types}[/:id]` create or rename/retire an entry; write access requires the new delegable `exams.catalog` capability, separate from `learning.publish`, matching how catalog management is a distinct nursery-administration concern from day-to-day publication. Retirement uses `enabled=false`; names can change freely because every exam snapshots the subject/type name at creation time, so a later rename never rewrites a historical exam's display.

`POST /api/v1/exams` creates an exam: name, subject, type, classroom, `assessedOn` (today or earlier), `gradeFormat` (`NUMERIC` or `LABEL`), and either a positive `maximumMarks` (+ optional `decimalAllowed`) or 2–12 unique `labelOptions`. Creation requires `learning.publish` and classroom scope, matching attendance's classroom-scoped writes. Exam definitions are append-only once created (migration trigger rejects update/delete); there is no exam-metadata edit endpoint in this phase. `GET /api/v1/exams?classroomId=&date=` lists exams for a classroom/date; `GET /api/v1/exams/:id` returns one exam's snapshotted metadata.

## Results and the shared daily checkpoint

`GET /api/v1/exams/:id/roster` returns the exam's classroom roster (same date-effective, active, ≤100-child page rule as attendance), each row showing that specific exam's current result (or `null` if missing) plus the child's current EXAM-checkpoint slot revision (`slotRevision`), used as `expectedVersion` for both publish and correction.

`POST /api/v1/exams/results` batch-publishes 1–100 entries for one exam: outcome `RESULT` (exactly one of numeric `score` or `label`, validated against the exam's snapshotted format/maximum/decimal flag) or `CHILD_ABSENT` (no score/label). A child already holding a result for that specific exam is rejected; use `POST /api/v1/exams/results/corrections` (single entry, required `reason`) instead. `POST /api/v1/exams/no-exam-day` publishes `NO_EXAM` for a wholly untouched classroom/date roster and is refused once any exam has been created for that classroom/date.

Because a classroom can have several exams on the same day, all of that day's exam activity for a child shares **one** EXAM checkpoint slot/revision chain — exactly as DAILY_LEARNING.md anticipates ("aggregate multiple exams... with appended transitions"). Each individual exam's own outcome/score/label/comment is stored in `exam_results`, keyed by its own learning event; the shared slot's status is *recomputed* on every write from every exam scheduled that classroom/date: pending (`AWAITING_RESULT`) while any applicable exam still lacks an outcome, `CHILD_ABSENT` only if every applicable exam resolved to child-absent, otherwise `RESULT_PUBLISHED`. Creating a **new** exam for a classroom/date that already had a fully resolved slot reopens it back to pending for every child whose EXAM slot was resolved (bounded to the same ≤100-child roster page), via an appended transition — matching "publishing another exam can reopen the aggregate pending state through a new recorded event; prior results remain unchanged."

This aggregate reopening/recomputation is a narrow, deliberate extension of the Phase 08 adapter contract: `LearningService.appendInTransaction` gained an `{ aggregateTransition: true }` option, usable only for `kind==='EXAM'`, that lets a `TRANSITION` land on an unchanged status (needed when a second exam is still pending) without weakening the public custom-checkpoint transition rule (changed status, unchanged note), exactly as CHECKPOINT_ENGINE.md invited.

## Child history

`GET /api/v1/exams/children/:id/history?subjectId=&typeId=&from=&until=&limit=&offset=` lists exams applicable to that child (classroom matched date-effectively via `child_classroom_history`, independent of whether a daily snapshot was ever created), each with its current result (or missing) and whether it has been corrected. Staff need current scope over the child; guardians need an active readable link. Numeric and label results are shown as recorded; no numeric average is ever synthesized, and a missing result is displayed distinctly from any real score, including zero.

## Migration and access

Migration `0008_exams.sql` adds `subjects`, `exam_types`, `exams`, and `exam_results`, plus the `exams.catalog` capability (delegable, `false` reserved). It grants no roles. It does not touch `checkpoint_configurations`/`checkpoint_statuses` because the EXAM checkpoint's four statuses were already fully seeded in Phase 08. Staff continue to require explicitly assigned `learning.read`/`learning.publish` (and `exams.catalog` for catalog writes); guardians act only through an active readable child link. EXAMS module disable immediately removes ordinary read/write access; retained history stays available through the underlying learning engine's staff history endpoint.
