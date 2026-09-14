-- Phase 10 exam adapter. Subject/type catalogs stay editable; exam definitions and results are append-only.
insert into capabilities(key,reserved) values ('exams.catalog',false);

create table subjects (
 id uuid primary key, name text not null check(length(name) between 1 and 120),
 enabled boolean not null default true, version integer not null default 1
);
create table exam_types (
 id uuid primary key, name text not null check(length(name) between 1 and 120),
 enabled boolean not null default true, version integer not null default 1
);

create table exams (
 id uuid primary key, name text not null check(length(name) between 1 and 160),
 subject_id uuid not null references subjects(id), subject_name text not null check(length(subject_name) between 1 and 120),
 type_id uuid not null references exam_types(id), type_name text not null check(length(type_name) between 1 and 120),
 classroom_id uuid not null references classrooms(id), branch_id uuid not null references branches(id),
 assessed_on date not null, grade_format text not null check(grade_format in ('NUMERIC','LABEL')),
 maximum_marks numeric(8,2) check(maximum_marks is null or maximum_marks>0),
 decimal_allowed boolean not null default false,
 label_options jsonb,
 creator_id uuid not null references accounts(id), created_at timestamptz not null default now(),
 check((grade_format='NUMERIC') = (maximum_marks is not null)),
 check((grade_format='LABEL') = (label_options is not null)),
 check(grade_format='NUMERIC' or not decimal_allowed)
);
create index exams_classroom_date on exams(classroom_id,assessed_on);
create index exams_subject on exams(subject_id);
create index exams_type on exams(type_id);

-- Snapshotted per event: the aggregate EXAM checkpoint status is shared across every exam that
-- day, so an individual exam's own outcome/score/label/comment lives here, keyed by its own event.
create table exam_results (
 event_id uuid primary key references learning_events(id), exam_id uuid not null references exams(id),
 child_id uuid not null references children(id), outcome text not null check(outcome in ('RESULT','CHILD_ABSENT')),
 score numeric(8,2) check(score is null or score>=0), label text check(label is null or length(label) between 1 and 60),
 comment text check(comment is null or length(comment)<=2000),
 check((outcome='RESULT') = ((score is not null) <> (label is not null)))
);
create index exam_results_exam on exam_results(exam_id);
create index exam_results_child on exam_results(child_id);

create function preserve_exam_history() returns trigger language plpgsql as $$
begin raise exception 'Exam history is append-only'; end $$;
create trigger exams_immutable before update or delete on exams for each row execute function preserve_exam_history();
create trigger exam_results_immutable before update or delete on exam_results for each row execute function preserve_exam_history();
