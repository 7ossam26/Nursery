insert into capabilities(key,reserved) values ('children.read',false),('children.manage',false),('guardians.manage',false),('documents.manage',false);
create table guardian_profiles (
 account_id uuid primary key references accounts(id), full_name text not null check(length(full_name) between 1 and 160),
 mobile text not null check(length(mobile) between 7 and 40), version integer not null default 1
);
create table children (
 id uuid primary key, code text not null unique check(code ~ '^[A-Z0-9_-]{1,32}$'), full_name text not null check(length(full_name) between 1 and 160), birth_date date not null,
 branch_id uuid not null references branches(id), classroom_id uuid, status text not null default 'ACTIVE' check(status in ('ACTIVE','PAUSED','ARCHIVED')),
 public_message text check(length(public_message) <= 500), version integer not null default 1,
 foreign key(classroom_id,branch_id) references classrooms(id,branch_id)
);
create index children_scope on children(branch_id,classroom_id,status);
create table child_contacts (
 id uuid primary key, child_id uuid not null references children(id), full_name text not null check(length(full_name) between 1 and 160),
 mobile text not null check(length(mobile) between 7 and 40), relationship text not null check(length(relationship) between 1 and 80)
);
create table guardian_child_links (
 guardian_id uuid not null references guardian_profiles(account_id), child_id uuid not null references children(id), relationship text not null check(length(relationship) between 1 and 80),
 can_read boolean not null, can_finance boolean not null, can_pickup boolean not null, can_notify boolean not null, active boolean not null default true, version integer not null default 1,
 primary key(guardian_id,child_id)
);
create index guardian_links_child on guardian_child_links(child_id);
create table child_status_history (
 id uuid primary key, child_id uuid not null references children(id), actor_id uuid not null references accounts(id), branch_id uuid not null references branches(id),
 previous_status text, new_status text not null, effective_on date not null, reason text not null, public_message text, child_name_snapshot text not null, created_at timestamptz not null default now()
);
create table child_classroom_history (
 id uuid primary key, child_id uuid not null references children(id), actor_id uuid not null references accounts(id), branch_id uuid not null references branches(id),
 previous_classroom_id uuid references classrooms(id), classroom_id uuid references classrooms(id), effective_on date not null, reason text not null, child_name_snapshot text not null, created_at timestamptz not null default now()
);
create table child_audit_events (
 id uuid primary key, child_id uuid references children(id), actor_id uuid not null references accounts(id), branch_id uuid references branches(id), event text not null,
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table child_onboarding_operations (
 actor_id uuid not null references accounts(id), operation_id uuid not null, input_hash text not null, child_ids uuid[] not null, guardian_ids uuid[] not null, primary key(actor_id,operation_id)
);
create table child_integration_events (
 id uuid primary key, child_id uuid not null references children(id), kind text not null, effective_on date not null, payload jsonb not null, created_at timestamptz not null default now()
);
create table child_documents (
 id uuid primary key, child_id uuid not null references children(id), branch_id uuid not null references branches(id), name text not null check(length(name) between 1 and 160), expires_on date,
 storage_key uuid not null unique, mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')), byte_size integer not null check(byte_size between 1 and 5242880),
 sha256 text not null, created_by uuid not null references accounts(id), retired boolean not null default false
);
create function preserve_child_history() returns trigger language plpgsql as $$
begin raise exception 'Child history is append-only'; end $$;
create trigger child_status_immutable before update or delete on child_status_history for each row execute function preserve_child_history();
create trigger child_classroom_immutable before update or delete on child_classroom_history for each row execute function preserve_child_history();
create trigger child_audit_immutable before update or delete on child_audit_events for each row execute function preserve_child_history();
create trigger child_integration_immutable before update or delete on child_integration_events for each row execute function preserve_child_history();
create function preserve_child_branch() returns trigger language plpgsql as $$
begin
 if new.branch_id <> old.branch_id then raise exception 'Branch transfer service is not implemented'; end if;
 return new;
end $$;
create trigger child_branch_fixed before update of branch_id on children for each row execute function preserve_child_branch();
create function require_guardian_kind() returns trigger language plpgsql as $$
begin
 if (select kind from accounts where id=new.account_id) <> 'GUARDIAN' then raise exception 'Guardian profile needs GUARDIAN account'; end if;
 return new;
end $$;
create trigger guardian_kind before insert or update on guardian_profiles for each row execute function require_guardian_kind();
-- Close the prerequisite ledger's missing kind check: reserved slots cannot change category.
create function require_seat_account_kind() returns trigger language plpgsql as $$
begin
 if (select kind from accounts where id=new.account_id) <> (case when new.kind='PARENT' then 'GUARDIAN' else 'STAFF' end) then raise exception 'Reservation kind must match account kind'; end if;
 if tg_op='UPDATE' and (new.kind<>old.kind or new.account_id<>old.account_id) then raise exception 'Reservation ownership is immutable'; end if;
 return new;
end $$;
create trigger seat_account_kind before insert or update on seat_reservations for each row execute function require_seat_account_kind();
