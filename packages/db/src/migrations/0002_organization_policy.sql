create table policy_revision (singleton boolean primary key default true check(singleton), version integer not null default 1);
insert into policy_revision default values;
alter table accounts add column scope_mode text not null default 'CLASSROOM' check(scope_mode in ('BRANCH','CLASSROOM'));
alter table accounts add column assignment_version integer not null default 1;
create table branches (
  id uuid primary key, code text not null unique check(code ~ '^[A-Z0-9_-]{1,32}$'),
  name text not null check(length(name) between 1 and 120), version integer not null default 1
);
create table age_groups (
  id uuid primary key, code text not null unique check(code ~ '^[A-Z0-9_-]{1,32}$'),
  name text not null check(length(name) between 1 and 120),
  min_months integer not null check(min_months >= 0), max_months integer not null check(max_months >= min_months and max_months <= 216),
  version integer not null default 1
);
create table classrooms (
  id uuid primary key, branch_id uuid not null references branches(id),
  code text not null check(code ~ '^[A-Z0-9_-]{1,32}$'), name text not null check(length(name) between 1 and 120),
  age_group_id uuid references age_groups(id), capacity integer not null check(capacity between 1 and 1000),
  version integer not null default 1, unique(branch_id,code), unique(id,branch_id)
);
create table capabilities (key text primary key, reserved boolean not null default false);
insert into capabilities(key,reserved) values
 ('organization.read',false),('organization.manage',false),('users.assign_roles',false),
 ('roles.define',true),('grants.manage',true),('accounts.reset_password',true),('support.access',true),
 ('finance.correct',false);
create table roles (id uuid primary key, name text not null unique check(length(name) between 1 and 120), version integer not null default 1);
create table role_capabilities (role_id uuid not null references roles(id), capability_key text not null references capabilities(key), primary key(role_id,capability_key));
create function reject_reserved_role_capability() returns trigger language plpgsql as $$
begin
  if (select reserved from capabilities where key=new.capability_key) then raise exception 'Reserved capability cannot be attached to a role'; end if;
  return new;
end $$;
create trigger role_capabilities_reserved before insert or update on role_capabilities for each row execute function reject_reserved_role_capability();
create table account_roles (account_id uuid not null references accounts(id), role_id uuid not null references roles(id), primary key(account_id,role_id));
create table delegated_assignable_roles (account_id uuid not null references accounts(id), role_id uuid not null references roles(id), primary key(account_id,role_id));
create table sensitive_grants (account_id uuid primary key references accounts(id), sensitive_financial_edit boolean not null default false);
create table account_branches (account_id uuid not null references accounts(id), branch_id uuid not null references branches(id), primary key(account_id,branch_id));
create table teacher_classrooms (
  account_id uuid not null references accounts(id), classroom_id uuid not null, branch_id uuid not null,
  primary key(account_id,classroom_id),
  foreign key(classroom_id,branch_id) references classrooms(id,branch_id),
  foreign key(account_id,branch_id) references account_branches(account_id,branch_id)
);
create table policy_audit_events (
  id uuid primary key, actor_id uuid not null references accounts(id), event text not null,
  target_id uuid, branch_id uuid references branches(id), before_data jsonb, after_data jsonb,
  created_at timestamptz not null default now()
);
create function preserve_policy_audit() returns trigger language plpgsql as $$
begin raise exception 'Policy audit is append-only'; end $$;
create trigger policy_audit_immutable before update or delete on policy_audit_events for each row execute function preserve_policy_audit();
insert into roles(id,name) values
 ('04000000-0000-4000-8000-000000000001','Nursery administrator'),
 ('04000000-0000-4000-8000-000000000002','Branch manager'),
 ('04000000-0000-4000-8000-000000000003','Teacher');
insert into role_capabilities(role_id,capability_key) values
 ('04000000-0000-4000-8000-000000000001','organization.read'),
 ('04000000-0000-4000-8000-000000000001','organization.manage'),
 ('04000000-0000-4000-8000-000000000001','users.assign_roles'),
 ('04000000-0000-4000-8000-000000000002','organization.read'),
 ('04000000-0000-4000-8000-000000000002','organization.manage'),
 ('04000000-0000-4000-8000-000000000003','organization.read');
