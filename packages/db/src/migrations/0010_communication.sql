-- Recipient witnesses remain private. Published announcements are immutable.
insert into capabilities(key,reserved) values('announcements.manage',false);
create table announcements (
 id uuid primary key,actor_id uuid not null references accounts(id),title text not null check(length(title) between 1 and 160),
 body text not null check(length(body) between 1 and 2000),target jsonb not null,acknowledgment_required boolean not null,
 holiday_from date,holiday_until date,created_at timestamptz not null default now(),
 check((holiday_from is null and holiday_until is null) or (holiday_from is not null and holiday_until>=holiday_from))
);
create table announcement_recipients (
 id uuid primary key,announcement_id uuid not null references announcements(id),guardian_id uuid not null references guardian_profiles(account_id),
 child_id uuid not null references children(id),unique(announcement_id,guardian_id,child_id)
);
create index announcement_recipient_guardian on announcement_recipients(guardian_id,announcement_id);
create table announcement_acknowledgments (
 announcement_id uuid not null references announcements(id),guardian_id uuid not null references guardian_profiles(account_id),
 created_at timestamptz not null default now(),primary key(announcement_id,guardian_id)
);
create table communication_events (
 id uuid primary key,kind text not null check(kind='PLANNED_ABSENCE'),child_id uuid not null references children(id),
 business_date date not null,recipient_ids uuid[] not null,created_at timestamptz not null default now()
);
create table parent_notifications (
 id uuid primary key,event_key text not null,guardian_id uuid not null references guardian_profiles(account_id),child_id uuid not null references children(id),
 read boolean not null default false,created_at timestamptz not null default now(),unique(event_key,guardian_id)
);
create index parent_notification_guardian on parent_notifications(guardian_id,created_at,id);
create trigger announcements_immutable before update or delete on announcements for each row execute function preserve_learning_history();
create trigger announcement_recipients_immutable before update or delete on announcement_recipients for each row execute function preserve_learning_history();
create trigger announcement_acknowledgments_immutable before update or delete on announcement_acknowledgments for each row execute function preserve_learning_history();
create trigger communication_events_immutable before update or delete on communication_events for each row execute function preserve_learning_history();
-- Source identities, not delivery cursors: no mutation of any upstream history/outbox.
create view parent_notification_sources as
 select 'learning:'||o.event_id::text as event_key,o.child_id,'LEARNING'::text as kind,o.module_key,o.business_date,o.recipient_ids,null::uuid as announcement_id
 from learning_change_outbox o where not exists(select 1 from attendance_absence_alerts a where a.event_id=o.event_id)
 union all select 'absence:'||a.event_id::text,a.child_id,'UNEXPECTED_ABSENCE','ATTENDANCE',o.business_date,a.recipient_ids,null::uuid
 from attendance_absence_alerts a join learning_change_outbox o on o.event_id=a.event_id
 union all select 'homework:'||o.version_id::text||':'||o.child_id::text,o.child_id,'HOMEWORK','HOMEWORK',a.assigned_on,o.recipient_ids,null::uuid
 from homework_content_outbox o join homework_versions v on v.id=o.version_id join homework_assignments a on a.id=v.assignment_id
 union all select 'incident:'||e.id::text,e.child_id,'INCIDENT','INCIDENTS',null::date,e.recipient_ids,null::uuid from notification_events e where e.resource_type='incident'
 union all select 'communication:'||e.id::text,e.child_id,e.kind,'ATTENDANCE',e.business_date,e.recipient_ids,null::uuid from communication_events e
 union all select 'announcement:'||a.id::text,r.child_id,case when a.holiday_from is null then 'ANNOUNCEMENT' else 'HOLIDAY' end,null::text,a.holiday_from,array[r.guardian_id],a.id
 from announcement_recipients r join announcements a on a.id=r.announcement_id;
