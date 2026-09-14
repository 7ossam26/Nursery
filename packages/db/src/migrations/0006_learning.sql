insert into capabilities(key,reserved) values ('learning.configure',true),('learning.read',false),('learning.publish',false);
-- Custom checkpoints need the same immediate off switch as the built-in modules (D34).
alter table module_settings drop constraint module_settings_module_key_check;
alter table module_settings add constraint module_settings_module_key_check check(module_key in ('FINANCE','ATTENDANCE','EXAMS','HOMEWORK','HEALTH','PICKUP','INCIDENTS','CUSTOM_CHECKPOINTS'));
insert into module_settings(module_key) values ('CUSTOM_CHECKPOINTS');
create table checkpoint_configurations (
 id uuid primary key, version integer not null unique check(version>0), effective_on date not null,
 actor_id uuid references accounts(id), created_at timestamptz not null default now()
);
create table checkpoint_definitions (id uuid primary key, kind text not null check(kind in ('ATTENDANCE','EXAM','HOMEWORK','STATUS_NOTE')));
create unique index checkpoint_builtin_kind on checkpoint_definitions(kind) where kind <> 'STATUS_NOTE';
create table checkpoint_versions (
 configuration_id uuid not null references checkpoint_configurations(id), definition_id uuid not null references checkpoint_definitions(id),
 definition jsonb not null, primary key(configuration_id,definition_id)
);
create table checkpoint_statuses (
 definition_id uuid not null references checkpoint_definitions(id), id uuid not null, meaning text not null check(meaning in ('PENDING','RESOLVED','NOT_APPLICABLE')),
 outcome text, primary key(definition_id,id)
);
create table checkpoint_status_versions (
 configuration_id uuid not null, definition_id uuid not null, status_id uuid not null, status jsonb not null,
 primary key(configuration_id,definition_id,status_id),
 foreign key(configuration_id,definition_id) references checkpoint_versions(configuration_id,definition_id),
 foreign key(definition_id,status_id) references checkpoint_statuses(definition_id,id)
);
create table daily_snapshots (
 id uuid primary key, child_id uuid not null references children(id), business_date date not null,
 branch_id uuid not null references branches(id), classroom_id uuid not null references classrooms(id),
 configuration_id uuid not null references checkpoint_configurations(id), unique(child_id,business_date), unique(id,configuration_id)
);
create table daily_slots (
 id uuid primary key, snapshot_id uuid not null, configuration_id uuid not null, definition_id uuid not null,
 unique(snapshot_id,definition_id), unique(id,configuration_id,definition_id),
 foreign key(snapshot_id,configuration_id) references daily_snapshots(id,configuration_id),
 foreign key(configuration_id,definition_id) references checkpoint_versions(configuration_id,definition_id)
);
create table learning_events (
 id uuid primary key, slot_id uuid not null, configuration_id uuid not null, definition_id uuid not null, status_id uuid not null,
 revision integer not null check(revision>0), previous_id uuid unique, previous_revision integer,
 action text not null check(action in ('PUBLISH','TRANSITION','CORRECTION')),
 note text check(length(note)<=2000), reason text check(length(trim(reason)) between 1 and 500),
 actor_id uuid not null references accounts(id), created_at timestamptz not null default now(),
 unique(slot_id,revision), unique(id,slot_id,revision),
 foreign key(slot_id,configuration_id,definition_id) references daily_slots(id,configuration_id,definition_id),
 foreign key(configuration_id,definition_id,status_id) references checkpoint_status_versions(configuration_id,definition_id,status_id),
 foreign key(previous_id,slot_id,previous_revision) references learning_events(id,slot_id,revision),
 check((revision=1 and previous_id is null and previous_revision is null and action='PUBLISH') or (revision>1 and previous_id is not null and previous_revision is not null and previous_revision=revision-1 and action<>'PUBLISH')),
 check((action='CORRECTION' and reason is not null) or (action<>'CORRECTION' and reason is null))
);
create table learning_operations (
 actor_id uuid not null references accounts(id), operation_id uuid not null, request_hash text not null, result jsonb not null,
 primary key(actor_id,operation_id)
);
-- Append-only invalidations. Phase 12 keeps delivery cursors/acknowledgments separately.
create table learning_change_outbox (
 id uuid primary key, event_id uuid not null unique references learning_events(id), child_id uuid not null references children(id),
 branch_id uuid not null references branches(id), classroom_id uuid not null references classrooms(id),
 business_date date not null, module_key text not null references module_settings(module_key), recipient_ids uuid[] not null,
 created_at timestamptz not null default now()
);
create index learning_outbox_scope on learning_change_outbox(child_id,created_at,id);
create function preserve_learning_history() returns trigger language plpgsql as $$
begin raise exception 'Learning history is append-only'; end $$;
create trigger checkpoint_configurations_immutable before update or delete on checkpoint_configurations for each row execute function preserve_learning_history();
create trigger checkpoint_definitions_immutable before update or delete on checkpoint_definitions for each row execute function preserve_learning_history();
create trigger checkpoint_versions_immutable before update or delete on checkpoint_versions for each row execute function preserve_learning_history();
create trigger checkpoint_statuses_immutable before update or delete on checkpoint_statuses for each row execute function preserve_learning_history();
create trigger checkpoint_status_versions_immutable before update or delete on checkpoint_status_versions for each row execute function preserve_learning_history();
create trigger daily_snapshots_immutable before update or delete on daily_snapshots for each row execute function preserve_learning_history();
create trigger daily_slots_immutable before update or delete on daily_slots for each row execute function preserve_learning_history();
create trigger learning_events_immutable before update or delete on learning_events for each row execute function preserve_learning_history();
create trigger learning_operations_immutable before update or delete on learning_operations for each row execute function preserve_learning_history();
create trigger learning_change_outbox_immutable before update or delete on learning_change_outbox for each row execute function preserve_learning_history();
insert into checkpoint_configurations(id,version,effective_on) values ('08000000-0000-4000-8002-000000000001',1,'0001-01-01');
insert into checkpoint_definitions(id,kind) values ('08000000-0000-4000-8000-000000000001','ATTENDANCE');
insert into checkpoint_versions(configuration_id,definition_id,definition) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000001','{"id":"08000000-0000-4000-8000-000000000001","kind":"ATTENDANCE","label":{"en":"Attendance","ar-EG":"الحضور"},"icon":"calendar","order":0,"enabled":true,"enabledFrom":null,"enabledUntil":null,"statuses":[{"id":"08000000-0000-4000-8001-000000000100","label":{"en":"Not recorded","ar-EG":"لسه متسجلش"},"outcome":"UNRECORDED","meaning":"PENDING","theme":"neutral","order":0,"enabled":true},{"id":"08000000-0000-4000-8001-000000000101","label":{"en":"Present","ar-EG":"حاضر"},"outcome":"PRESENT","meaning":"RESOLVED","theme":"neutral","order":1,"enabled":true},{"id":"08000000-0000-4000-8001-000000000102","label":{"en":"Absent","ar-EG":"غايب"},"outcome":"ABSENT","meaning":"RESOLVED","theme":"neutral","order":2,"enabled":true}]}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000001','08000000-0000-4000-8001-000000000100','PENDING','UNRECORDED');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000001','08000000-0000-4000-8001-000000000100','{"id":"08000000-0000-4000-8001-000000000100","label":{"en":"Not recorded","ar-EG":"لسه متسجلش"},"outcome":"UNRECORDED","meaning":"PENDING","theme":"neutral","order":0,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000001','08000000-0000-4000-8001-000000000101','RESOLVED','PRESENT');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000001','08000000-0000-4000-8001-000000000101','{"id":"08000000-0000-4000-8001-000000000101","label":{"en":"Present","ar-EG":"حاضر"},"outcome":"PRESENT","meaning":"RESOLVED","theme":"neutral","order":1,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000001','08000000-0000-4000-8001-000000000102','RESOLVED','ABSENT');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000001','08000000-0000-4000-8001-000000000102','{"id":"08000000-0000-4000-8001-000000000102","label":{"en":"Absent","ar-EG":"غايب"},"outcome":"ABSENT","meaning":"RESOLVED","theme":"neutral","order":2,"enabled":true}');
insert into checkpoint_definitions(id,kind) values ('08000000-0000-4000-8000-000000000002','EXAM');
insert into checkpoint_versions(configuration_id,definition_id,definition) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000002','{"id":"08000000-0000-4000-8000-000000000002","kind":"EXAM","label":{"en":"Exam result","ar-EG":"نتيجة الاختبار"},"icon":"learning","order":1,"enabled":true,"enabledFrom":null,"enabledUntil":null,"statuses":[{"id":"08000000-0000-4000-8001-000000000200","label":{"en":"Awaiting result","ar-EG":"مستني النتيجة"},"outcome":"AWAITING_RESULT","meaning":"PENDING","theme":"neutral","order":0,"enabled":true},{"id":"08000000-0000-4000-8001-000000000201","label":{"en":"Result published","ar-EG":"النتيجة اتنشرت"},"outcome":"RESULT_PUBLISHED","meaning":"RESOLVED","theme":"neutral","order":1,"enabled":true},{"id":"08000000-0000-4000-8001-000000000202","label":{"en":"No exam today","ar-EG":"مفيش اختبار النهارده"},"outcome":"NO_EXAM","meaning":"NOT_APPLICABLE","theme":"neutral","order":2,"enabled":true},{"id":"08000000-0000-4000-8001-000000000203","label":{"en":"Child absent","ar-EG":"الطفل غايب"},"outcome":"CHILD_ABSENT","meaning":"NOT_APPLICABLE","theme":"neutral","order":3,"enabled":true}]}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000200','PENDING','AWAITING_RESULT');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000200','{"id":"08000000-0000-4000-8001-000000000200","label":{"en":"Awaiting result","ar-EG":"مستني النتيجة"},"outcome":"AWAITING_RESULT","meaning":"PENDING","theme":"neutral","order":0,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000201','RESOLVED','RESULT_PUBLISHED');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000201','{"id":"08000000-0000-4000-8001-000000000201","label":{"en":"Result published","ar-EG":"النتيجة اتنشرت"},"outcome":"RESULT_PUBLISHED","meaning":"RESOLVED","theme":"neutral","order":1,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000202','NOT_APPLICABLE','NO_EXAM');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000202','{"id":"08000000-0000-4000-8001-000000000202","label":{"en":"No exam today","ar-EG":"مفيش اختبار النهارده"},"outcome":"NO_EXAM","meaning":"NOT_APPLICABLE","theme":"neutral","order":2,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000203','NOT_APPLICABLE','CHILD_ABSENT');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000002','08000000-0000-4000-8001-000000000203','{"id":"08000000-0000-4000-8001-000000000203","label":{"en":"Child absent","ar-EG":"الطفل غايب"},"outcome":"CHILD_ABSENT","meaning":"NOT_APPLICABLE","theme":"neutral","order":3,"enabled":true}');
insert into checkpoint_definitions(id,kind) values ('08000000-0000-4000-8000-000000000003','HOMEWORK');
insert into checkpoint_versions(configuration_id,definition_id,definition) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','{"id":"08000000-0000-4000-8000-000000000003","kind":"HOMEWORK","label":{"en":"Homework","ar-EG":"الواجب"},"icon":"learning","order":2,"enabled":true,"enabledFrom":null,"enabledUntil":null,"statuses":[{"id":"08000000-0000-4000-8001-000000000300","label":{"en":"Not assigned","ar-EG":"لسه متحددش"},"outcome":"NOT_ASSIGNED","meaning":"PENDING","theme":"neutral","order":0,"enabled":true},{"id":"08000000-0000-4000-8001-000000000301","label":{"en":"Assigned/awaiting review","ar-EG":"اتحدد ومستني المراجعة"},"outcome":"AWAITING_REVIEW","meaning":"PENDING","theme":"neutral","order":1,"enabled":true},{"id":"08000000-0000-4000-8001-000000000302","label":{"en":"Completed","ar-EG":"اتعمل"},"outcome":"COMPLETED","meaning":"RESOLVED","theme":"neutral","order":2,"enabled":true},{"id":"08000000-0000-4000-8001-000000000303","label":{"en":"Not completed","ar-EG":"متعملش"},"outcome":"NOT_COMPLETED","meaning":"RESOLVED","theme":"neutral","order":3,"enabled":true},{"id":"08000000-0000-4000-8001-000000000304","label":{"en":"Excused","ar-EG":"معذور"},"outcome":"EXCUSED","meaning":"NOT_APPLICABLE","theme":"neutral","order":4,"enabled":true},{"id":"08000000-0000-4000-8001-000000000305","label":{"en":"No homework today","ar-EG":"مفيش واجب النهارده"},"outcome":"NO_HOMEWORK","meaning":"NOT_APPLICABLE","theme":"neutral","order":5,"enabled":true}]}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000300','PENDING','NOT_ASSIGNED');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000300','{"id":"08000000-0000-4000-8001-000000000300","label":{"en":"Not assigned","ar-EG":"لسه متحددش"},"outcome":"NOT_ASSIGNED","meaning":"PENDING","theme":"neutral","order":0,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000301','PENDING','AWAITING_REVIEW');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000301','{"id":"08000000-0000-4000-8001-000000000301","label":{"en":"Assigned/awaiting review","ar-EG":"اتحدد ومستني المراجعة"},"outcome":"AWAITING_REVIEW","meaning":"PENDING","theme":"neutral","order":1,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000302','RESOLVED','COMPLETED');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000302','{"id":"08000000-0000-4000-8001-000000000302","label":{"en":"Completed","ar-EG":"اتعمل"},"outcome":"COMPLETED","meaning":"RESOLVED","theme":"neutral","order":2,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000303','RESOLVED','NOT_COMPLETED');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000303','{"id":"08000000-0000-4000-8001-000000000303","label":{"en":"Not completed","ar-EG":"متعملش"},"outcome":"NOT_COMPLETED","meaning":"RESOLVED","theme":"neutral","order":3,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000304','NOT_APPLICABLE','EXCUSED');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000304','{"id":"08000000-0000-4000-8001-000000000304","label":{"en":"Excused","ar-EG":"معذور"},"outcome":"EXCUSED","meaning":"NOT_APPLICABLE","theme":"neutral","order":4,"enabled":true}');
insert into checkpoint_statuses(definition_id,id,meaning,outcome) values ('08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000305','NOT_APPLICABLE','NO_HOMEWORK');
insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values ('08000000-0000-4000-8002-000000000001','08000000-0000-4000-8000-000000000003','08000000-0000-4000-8001-000000000305','{"id":"08000000-0000-4000-8001-000000000305","label":{"en":"No homework today","ar-EG":"مفيش واجب النهارده"},"outcome":"NO_HOMEWORK","meaning":"NOT_APPLICABLE","theme":"neutral","order":5,"enabled":true}');
