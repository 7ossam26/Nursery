# Attendance and daily classroom reports

Phase 09 implements R06–R07 attendance behavior on the Phase 08 checkpoint engine. It does not add child arrival/departure times, bus attendance, employee attendance, or end-of-day-only visibility.

## Publication and reporting

`GET /api/v1/attendance/classrooms/:id/draft?date=YYYY-MM-DD` returns at most the current 100-child classroom roster page in stable name/ID order. Only active, currently scoped children whose retained placement and lifecycle are active for the requested date appear. Each row is explicitly missing until a teacher selects and publishes it; the system never infers an untouched child as present or absent. The explicit bulk-present button only selects unpublished rows in the displayed reviewed page.

`POST /api/v1/attendance/classroom-publications` accepts one to 100 unique selected rows. It maps the supplied snapshotted status ID to PRESENT or ABSENT, stores the optional absence reason only for ABSENT, and commits the detailed attendance row with the learning event, operation result, audit, and scoped `learning_change_outbox` invalidation in one transaction. Matching actor/operation retries return the original result after fresh authorization; changed reuse conflicts.

`POST /api/v1/attendance/corrections` requires the effective expected revision and a nonblank reason. A correction appends both a new learning event and attendance payload. The original remains in `GET /api/v1/attendance/children/:id/history`; concurrent stale writers cannot overwrite the winner. Current teacher assignment/scope is revalidated for writes and replay.

`GET /api/v1/attendance/children/:id/daily?date=...` returns the authoritative current attendance payload alongside the snapshotted daily definition/progress bar. Missing, PRESENT, ABSENT, and NO_CLASS are distinct. Present and absent resolve progress; NO_CLASS is explicitly N/A. Historical labels/counts remain those of the existing daily snapshot after later configuration changes.

## Calendar and notices

Migration `0007_attendance.sql` appends the NO_CLASS attendance status with `NOT_APPLICABLE` meaning in a new immutable configuration version effective no earlier than the next Cairo date. Existing snapshots are unchanged. The teacher's explicit `POST /api/v1/attendance/no-class` action publishes NO_CLASS for every still-missing child in the reviewed roster page; it refuses to replace any existing attendance. Larger classrooms follow the engine's 100-row reviewed-page boundary.

Guardians may use `PUT /api/v1/attendance/planned-absence` for an inclusive current/future range of up to 366 days and an optional reason. Storage is normalized to one row per guardian/child/date, so a repeated identical range does not duplicate data and changed reasons update only unpublished dates. The notice is advisory and never creates attendance. A blocked guardian, inactive child, lost read link, or disabled attendance module denies the direct endpoint.

An ABSENT publication with no planned notice atomically creates one append-only `attendance_absence_alerts` row for that effective event. This is only a durable notification boundary: Phase 12 owns delivery and must revalidate recipients. Every attendance publication also uses the existing payload-free scoped learning outbox.

## Migration and access

Apply `0007_attendance.sql` after `0006_learning.sql`. It creates `attendance_records`, `attendance_planned_absences`, and `attendance_absence_alerts`, plus the new immutable checkpoint version. It grants no roles. Staff continue to require explicitly assigned `learning.read` and `learning.publish`; guardians act only through an active readable child link. ATTENDANCE disable immediately removes current task/read access while staff history remains retained and scoped.
