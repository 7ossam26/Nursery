insert into capabilities(key,reserved) values
 ('licensing.manage',true),('seats.release',true),('branding.manage',true),
 ('modules.manage',false),('users.manage_staff',false),('users.create_parent',false),('parents.block',false);

create table license_limits (
  singleton boolean primary key default true check(singleton),
  parent_capacity integer not null check(parent_capacity >= 0),
  employee_capacity integer not null check(employee_capacity >= 0),
  parent_unit_price_piastres integer not null check(parent_unit_price_piastres >= 0),
  employee_unit_price_piastres integer not null check(employee_unit_price_piastres >= 0),
  subscription_period text not null check(subscription_period in ('MONTHLY','YEARLY')),
  starts_on date not null,
  valid_until date not null check(valid_until >= starts_on),
  grace_days integer not null default 7 check(grace_days between 0 and 90),
  agreed_total_override_piastres integer check(agreed_total_override_piastres is null or agreed_total_override_piastres >= 0),
  agreed_total_override_reason text check(agreed_total_override_reason is null or length(agreed_total_override_reason) between 1 and 500),
  support_contact text check(support_contact is null or length(support_contact) <= 500),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check((agreed_total_override_piastres is null) = (agreed_total_override_reason is null))
);

create table seat_reservations (
  id uuid primary key,
  kind text not null check(kind in ('PARENT','EMPLOYEE')),
  account_id uuid not null references accounts(id),
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references accounts(id),
  released_reason text check(released_reason is null or length(released_reason) between 1 and 500),
  check((released_at is null) = (released_by is null) and (released_at is null) = (released_reason is null))
);
-- At most one active (unreleased) reservation per account; capacity counts active rows per kind.
create unique index seat_reservations_active_account on seat_reservations(account_id) where released_at is null;
create index seat_reservations_kind_active on seat_reservations(kind) where released_at is null;

create table license_renewal_payments (
  id uuid primary key,
  recorded_at timestamptz not null default now(),
  period_start date not null,
  period_end date not null check(period_end >= period_start),
  amount_piastres integer not null check(amount_piastres >= 0),
  method text not null check(length(method) between 1 and 120),
  note text check(note is null or length(note) <= 500),
  recorded_by uuid not null references accounts(id)
);

create table licensing_audit_events (
  id uuid primary key,
  actor_id uuid not null references accounts(id),
  event text not null,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create function preserve_licensing_audit() returns trigger language plpgsql as $$
begin raise exception 'Licensing audit is append-only'; end $$;
create trigger licensing_audit_immutable before update or delete on licensing_audit_events for each row execute function preserve_licensing_audit();

create table nursery_settings (
  singleton boolean primary key default true check(singleton),
  name text not null check(length(name) between 1 and 160),
  logo_path text check(logo_path is null or length(logo_path) <= 500),
  contact_phone text check(contact_phone is null or length(contact_phone) <= 40),
  contact_email text check(contact_email is null or length(contact_email) <= 200),
  theme jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
-- Seeded so branding (login screen included) always has a value; matches the shipped default palette exactly.
insert into nursery_settings(name,theme) values ('Nursery', '{
  "brandPink":"#F13E93","softPink":"#F891BB","peach":"#F9D0CD","paleYellow":"#FAFFCB",
  "text":"#111827","surface":"#FFFFFF","background":"#FFF7FA","strongPinkButton":"#BE185D",
  "success":"#166534","warning":"#92400E","error":"#B42318"
}'::jsonb);

create table module_settings (
  module_key text primary key check(module_key in ('FINANCE','ATTENDANCE','EXAMS','HOMEWORK','HEALTH')),
  enabled boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into module_settings(module_key) values ('FINANCE'),('ATTENDANCE'),('EXAMS'),('HOMEWORK'),('HEALTH');

create table module_settings_history (
  id uuid primary key,
  module_key text not null,
  actor_id uuid not null references accounts(id),
  previous_enabled boolean not null,
  new_enabled boolean not null,
  reason text not null check(length(reason) between 1 and 500),
  catchup_previewed boolean not null default false,
  created_at timestamptz not null default now()
);
