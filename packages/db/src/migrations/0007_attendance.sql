-- Phase 09 attendance adapter. NO_CLASS is an explicit reporting outcome, never inferred.
insert into checkpoint_statuses(definition_id,id,meaning,outcome)
values ('08000000-0000-4000-8000-000000000001','09000000-0000-4000-8001-000000000100','NOT_APPLICABLE','NO_CLASS');

insert into checkpoint_configurations(id,version,effective_on)
select '09000000-0000-4000-8002-000000000001',version+1,
       greatest(effective_on,((now() at time zone 'Africa/Cairo')::date + 1))
from checkpoint_configurations order by version desc limit 1;

insert into checkpoint_versions(configuration_id,definition_id,definition)
select '09000000-0000-4000-8002-000000000001',definition_id,
  case when definition_id='08000000-0000-4000-8000-000000000001' then
    jsonb_set(definition,'{statuses}',definition->'statuses' ||
      '{"id":"09000000-0000-4000-8001-000000000100","label":{"en":"No class day","ar-EG":"مفيش فصل النهارده"},"outcome":"NO_CLASS","meaning":"NOT_APPLICABLE","theme":"neutral","order":3,"enabled":true}'::jsonb)
  else definition end
from checkpoint_versions
where configuration_id=(select id from checkpoint_configurations where id<>'09000000-0000-4000-8002-000000000001' order by version desc limit 1);

insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status)
select '09000000-0000-4000-8002-000000000001',definition_id,status_id,status
from checkpoint_status_versions
where configuration_id=(select id from checkpoint_configurations where id<>'09000000-0000-4000-8002-000000000001' order by version desc limit 1);
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status)
values ('09000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000001','09000000-0000-4000-8001-000000000100',
  '{"id":"09000000-0000-4000-8001-000000000100","label":{"en":"No class day","ar-EG":"مفيش فصل النهارده"},"outcome":"NO_CLASS","meaning":"NOT_APPLICABLE","theme":"neutral","order":3,"enabled":true}');

create table attendance_records (
 event_id uuid primary key references learning_events(id), presence text not null check(presence in ('PRESENT','ABSENT','NO_CLASS')),
 absence_reason text check(length(absence_reason)<=500),
 check((presence='ABSENT') or absence_reason is null)
);
create table attendance_planned_absences (
 guardian_id uuid not null references guardian_profiles(account_id), child_id uuid not null references children(id), business_date date not null,
 reason text check(length(reason)<=500), version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
 primary key(guardian_id,child_id,business_date)
);
create index attendance_planned_absence_child_date on attendance_planned_absences(child_id,business_date);
create table attendance_absence_alerts (
 event_id uuid primary key references attendance_records(event_id), child_id uuid not null references children(id),
 recipient_ids uuid[] not null, created_at timestamptz not null default now()
);
create function preserve_attendance_history() returns trigger language plpgsql as $$
begin raise exception 'Attendance history is append-only'; end $$;
create trigger attendance_records_immutable before update or delete on attendance_records for each row execute function preserve_attendance_history();
create trigger attendance_alerts_immutable before update or delete on attendance_absence_alerts for each row execute function preserve_attendance_history();
