create table if not exists installation_baseline (
  id uuid primary key,
  created_at timestamptz not null default now()
);
