-- Phase 23: installation support, backup runs, isolated restore validations and worker heartbeats.
-- support.restore is Superadmin-only infrastructure (reserved): it can never be attached to an editable role.
insert into capabilities(key,reserved) values ('support.restore',true);

create table backup_runs (
 id uuid primary key,
 kind text not null check(kind in ('SCHEDULED','MANUAL','PRE_UPGRADE','PRE_RESTORE')),
 status text not null check(status in ('REQUESTED','RUNNING','SUCCEEDED','FAILED','SKIPPED')),
 requested_by uuid references accounts(id), reason text check(reason is null or length(reason) between 1 and 500),
 requested_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 installation_id uuid, release_version text, schema_version text,
 archive_name text check(archive_name is null or archive_name ~ '^backup-[A-Za-z0-9._-]{1,180}\.tar\.enc$'),
 archive_bytes bigint check(archive_bytes is null or archive_bytes>=0), archive_sha256 text check(archive_sha256 is null or archive_sha256 ~ '^[0-9a-f]{64}$'),
 manifest jsonb, offsite_copied_at timestamptz, archive_deleted_at timestamptz,
 error_code text check(error_code is null or length(error_code)<=80),
 check((status='SUCCEEDED' and archive_name is not null and archive_sha256 is not null and manifest is not null and finished_at is not null) or status<>'SUCCEEDED'),
 check((status in ('FAILED','SKIPPED') and error_code is not null and finished_at is not null) or status not in ('FAILED','SKIPPED'))
);
create index backup_runs_requested on backup_runs(requested_at desc);
-- At most one run may be executing at any time; the worker additionally holds an advisory lock while it works.
create unique index backup_runs_single_running on backup_runs((true)) where status='RUNNING';
create unique index backup_runs_archive_name on backup_runs(archive_name) where archive_name is not null;

create table restore_validations (
 id uuid primary key, backup_run_id uuid not null references backup_runs(id), requested_by uuid not null references accounts(id),
 status text not null check(status in ('REQUESTED','RUNNING','SUCCEEDED','FAILED')),
 requested_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 target_label text, report jsonb, error_code text check(error_code is null or length(error_code)<=80),
 check((status in ('SUCCEEDED','FAILED') and finished_at is not null) or status in ('REQUESTED','RUNNING'))
);
create index restore_validations_requested on restore_validations(requested_at desc);
create unique index restore_validations_single_running on restore_validations((true)) where status='RUNNING';

create table worker_heartbeats (
 name text primary key check(length(name) between 1 and 60), last_seen_at timestamptz not null default now(),
 release_version text, details jsonb not null default '{}'::jsonb
);

-- Support actions are audited separately from authentication and licensing. Details never contain secrets or child data.
create table support_audit_events (
 id uuid primary key, actor_id uuid not null references accounts(id), event text not null check(length(event) between 1 and 80),
 target_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index support_audit_events_created on support_audit_events(created_at desc);
