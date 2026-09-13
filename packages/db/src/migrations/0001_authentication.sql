create table accounts (
  id uuid primary key,
  kind text not null check (kind in ('SYSTEM', 'STAFF', 'GUARDIAN')),
  username_normalized text not null unique check (length(username_normalized) between 3 and 64),
  password_hash text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED', 'DISABLED', 'ARCHIVED', 'RELEASED')),
  status_until date,
  public_message text check (length(public_message) <= 500),
  locale text not null default 'en' check (locale in ('en', 'ar-EG')),
  version integer not null default 1,
  must_change_password boolean not null default true,
  temporary_expires_at timestamptz,
  temporary_used boolean not null default false,
  created_at timestamptz not null default now(),
  check (status_until is null or status = 'BLOCKED')
);
create unique index accounts_one_system on accounts (kind) where kind = 'SYSTEM';
create function preserve_account_kind() returns trigger language plpgsql as $$
begin
  if new.kind <> old.kind then raise exception 'Account kind is immutable'; end if;
  return new;
end $$;
create trigger accounts_kind_immutable before update of kind on accounts for each row execute function preserve_account_kind();

create table authentication_bootstrap (
  singleton boolean primary key default true check (singleton),
  installation_id uuid not null references installation_baseline(id),
  account_id uuid not null unique references accounts(id),
  completed_at timestamptz not null default now()
);
create table sessions (
  id uuid primary key,
  account_id uuid not null references accounts(id),
  token_hash text not null unique,
  account_version integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_account on sessions(account_id);
create table account_status_history (
  id uuid primary key,
  account_id uuid not null references accounts(id),
  actor_id uuid not null references accounts(id),
  previous_status text not null,
  new_status text not null,
  internal_reason text not null,
  public_message text,
  until_date date,
  created_at timestamptz not null default now()
);
create table auth_audit_events (
  id uuid primary key,
  event text not null,
  actor_id uuid references accounts(id),
  target_id uuid references accounts(id),
  created_at timestamptz not null default now()
);
create table auth_rate_limits (
  key_hash text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
