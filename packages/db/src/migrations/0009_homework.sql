create table homework_assignments (
 id uuid primary key, classroom_id uuid not null references classrooms(id), branch_id uuid not null references branches(id),
 assigned_on date not null, due_on date not null check(due_on>=assigned_on), creator_id uuid not null references accounts(id),
 foreign key(classroom_id,branch_id) references classrooms(id,branch_id)
);
create index homework_class_due on homework_assignments(classroom_id,due_on,assigned_on);
create table homework_versions (
 id uuid primary key, assignment_id uuid not null references homework_assignments(id), revision integer not null check(revision>0),
 previous_id uuid unique references homework_versions(id), title text not null check(length(trim(title)) between 1 and 160),
 instructions text not null check(length(trim(instructions)) between 1 and 4000), reason text, actor_id uuid not null references accounts(id),
 unique(assignment_id,revision), unique(id,assignment_id,revision), previous_revision integer,
 foreign key(previous_id,assignment_id,previous_revision) references homework_versions(id,assignment_id,revision),
 check((revision=1 and previous_id is null and previous_revision is null and reason is null) or (revision>1 and previous_id is not null and previous_revision=revision-1 and length(trim(reason)) between 1 and 500))
);
create table homework_recipients (
 assignment_id uuid not null references homework_assignments(id), child_id uuid not null references children(id), child_name text not null,
 primary key(assignment_id,child_id)
);
create index homework_recipient_child on homework_recipients(child_id,assignment_id);
create table homework_outcomes (
 id uuid primary key, assignment_id uuid not null, child_id uuid not null, revision integer not null check(revision>0),
 previous_id uuid unique, previous_revision integer, event_id uuid not null unique references learning_events(id),
 status jsonb not null, note text check(length(note)<=2000), effective_on date not null, reason text,
 unique(assignment_id,child_id,revision), unique(id,assignment_id,child_id,revision),
 foreign key(assignment_id,child_id) references homework_recipients(assignment_id,child_id),
 foreign key(previous_id,assignment_id,child_id,previous_revision) references homework_outcomes(id,assignment_id,child_id,revision),
 check(status->>'outcome' in ('COMPLETED','NOT_COMPLETED','EXCUSED')),
 check((revision=1 and previous_id is null and previous_revision is null and reason is null) or (revision>1 and previous_id is not null and previous_revision=revision-1 and length(trim(reason)) between 1 and 500))
);
create table homework_no_days (
 child_id uuid not null references children(id), business_date date not null, event_id uuid not null unique references learning_events(id),
 primary key(child_id,business_date)
);
-- Shared content corrections stage one invalidation per snapshotted child, with no sibling payload.
create table homework_content_outbox (
 id uuid primary key, version_id uuid not null references homework_versions(id), child_id uuid not null references children(id),
 branch_id uuid not null references branches(id), classroom_id uuid not null references classrooms(id), recipient_ids uuid[] not null,
 unique(version_id,child_id)
);
create trigger homework_assignments_immutable before update or delete on homework_assignments for each row execute function preserve_learning_history();
create trigger homework_versions_immutable before update or delete on homework_versions for each row execute function preserve_learning_history();
create trigger homework_recipients_immutable before update or delete on homework_recipients for each row execute function preserve_learning_history();
create trigger homework_outcomes_immutable before update or delete on homework_outcomes for each row execute function preserve_learning_history();
create trigger homework_no_days_immutable before update or delete on homework_no_days for each row execute function preserve_learning_history();
create trigger homework_content_outbox_immutable before update or delete on homework_content_outbox for each row execute function preserve_learning_history();
