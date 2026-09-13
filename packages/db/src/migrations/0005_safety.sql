insert into capabilities(key,reserved) values ('health.read',false),('health.manage',false),('pickup.record',false),('pickup.manage',false),('incidents.read',false),('incidents.manage',false);
-- R03 lists authorized pickup and incidents as optional modules; they become real modules in this phase (D33).
alter table module_settings drop constraint module_settings_module_key_check;
alter table module_settings add constraint module_settings_module_key_check check(module_key in ('FINANCE','ATTENDANCE','EXAMS','HOMEWORK','HEALTH','PICKUP','INCIDENTS'));
insert into module_settings(module_key) values ('PICKUP'),('INCIDENTS');
-- Notes, allergies/alerts and emergency contacts share one bounded record shape; no medication or dosing fields exist.
create table health_entries (
 id uuid primary key, child_id uuid not null references children(id), branch_id uuid not null references branches(id),
 kind text not null check(kind in ('NOTE','ALLERGY','ALERT','EMERGENCY_CONTACT')),
 title text not null check(length(title) between 1 and 160), body text not null check(length(body) <= 1000),
 mobile text check(mobile is null or length(mobile) between 7 and 40), severity text not null check(severity in ('INFO','CRITICAL')),
 active boolean not null default true, version integer not null default 1, created_by uuid not null references accounts(id), created_at timestamptz not null default now(),
 check((kind='EMERGENCY_CONTACT') = (mobile is not null))
);
create index health_entries_child on health_entries(child_id,active);
create table pickup_authorizations (
 id uuid primary key, child_id uuid not null references children(id), branch_id uuid not null references branches(id),
 full_name text not null check(length(full_name) between 1 and 160), mobile text not null check(length(mobile) between 7 and 40), relationship text not null check(length(relationship) between 1 and 80),
 valid_from date not null, valid_until date check(valid_until is null or valid_until >= valid_from), active boolean not null default true,
 review_decision text check(review_decision in ('APPROVED','REJECTED')), reviewed_by uuid references accounts(id), reviewed_at timestamptz, review_note text check(review_note is null or length(review_note) <= 500),
 created_by uuid not null references accounts(id), version integer not null default 1, created_at timestamptz not null default now(),
 check((review_decision is null) = (reviewed_by is null) and (review_decision is null) = (reviewed_at is null))
);
create index pickup_authorizations_child on pickup_authorizations(child_id,active);
-- Management records: a prohibited collector identity, or a review requirement for every authorized person. Private notes are never shown to guardians or record-only staff.
create table pickup_restrictions (
 id uuid primary key, child_id uuid not null references children(id), branch_id uuid not null references branches(id),
 kind text not null check(kind in ('PROHIBITED_COLLECTOR','REVIEW_REQUIRED')),
 full_name text check(full_name is null or length(full_name) between 1 and 160), mobile text check(mobile is null or length(mobile) between 7 and 40),
 summary text not null check(length(summary) between 1 and 200), private_note text check(private_note is null or length(private_note) <= 1000),
 active boolean not null default true, created_by uuid not null references accounts(id), version integer not null default 1, created_at timestamptz not null default now(),
 check(kind <> 'PROHIBITED_COLLECTOR' or full_name is not null)
);
create index pickup_restrictions_child on pickup_restrictions(child_id,active);
-- Date-only release records: business date plus private technical audit time; deliberately no arrival/departure clock fields.
create table pickup_records (
 id uuid primary key, child_id uuid not null references children(id), branch_id uuid not null references branches(id), business_date date not null,
 collector_kind text not null check(collector_kind in ('AUTHORIZED_PERSON','GUARDIAN')), authorization_id uuid references pickup_authorizations(id), collector_guardian_id uuid references guardian_profiles(account_id),
 collector_name_snapshot text not null, collector_relationship_snapshot text not null,
 called_guardian_id uuid not null references guardian_profiles(account_id), call_confirmed boolean not null check(call_confirmed), note text check(note is null or length(note) <= 500),
 recorded_by uuid not null references accounts(id), created_at timestamptz not null default now(),
 check((collector_kind='AUTHORIZED_PERSON') = (authorization_id is not null) and (collector_kind='GUARDIAN') = (collector_guardian_id is not null))
);
create index pickup_records_child on pickup_records(child_id,business_date);
create table incidents (
 id uuid primary key, child_id uuid not null references children(id), branch_id uuid not null references branches(id), classroom_id uuid references classrooms(id),
 occurred_on date not null, occurred_time time not null, description text not null check(length(description) between 1 and 2000), action_taken text not null check(length(action_taken) between 1 and 2000),
 guardian_informed boolean not null, contact_method text check(contact_method in ('CALL','WHATSAPP','IN_PERSON','IN_APP')), follow_up text check(follow_up is null or length(follow_up) <= 2000),
 status text not null default 'OPEN' check(status in ('OPEN','CLOSED')), reported_by uuid not null references accounts(id), version integer not null default 1, created_at timestamptz not null default now(),
 check(guardian_informed = (contact_method is not null))
);
create index incidents_child on incidents(child_id,occurred_on);
-- Durable Phase 12 input: recipient snapshot is revalidated at dispatch; payload carries invalidation hints only.
create table notification_events (
 id uuid primary key, kind text not null, child_id uuid not null references children(id), branch_id uuid not null references branches(id),
 resource_type text not null, resource_id uuid not null, resource_revision integer not null, recipient_ids uuid[] not null, payload jsonb not null, created_at timestamptz not null default now()
);
create index notification_events_child on notification_events(child_id,created_at);
create function preserve_safety_history() returns trigger language plpgsql as $$
begin raise exception 'Safety history is append-only'; end $$;
create trigger pickup_records_immutable before update or delete on pickup_records for each row execute function preserve_safety_history();
create trigger notification_events_immutable before update or delete on notification_events for each row execute function preserve_safety_history();
