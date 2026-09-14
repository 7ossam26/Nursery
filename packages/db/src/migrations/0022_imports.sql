-- Phase 21: versioned Excel import batches. Staged rows, preview and commit results are private to the creator.
insert into capabilities(key,reserved) values ('imports.commit',false);

create table import_batches (
 id uuid primary key,creator_id uuid not null references accounts(id),kind text not null check(kind in ('PARENTS_CHILDREN','OPENING_BALANCES','EMPLOYEES')),
 template_version integer not null check(template_version>0),file_name text not null check(length(file_name) between 1 and 200),sha256 text not null,
 status text not null check(status in ('PREVIEWED','COMMITTED')),staged jsonb not null,row_count integer not null check(row_count>=0),
 preview jsonb,preview_hash text,created_at timestamptz not null default now(),expires_at timestamptz not null,
 committed_at timestamptz,operation_id uuid,result jsonb,
 foreign key(creator_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 unique(creator_id,operation_id),
 check((status='COMMITTED' and committed_at is not null and operation_id is not null and result is not null) or (status='PREVIEWED' and committed_at is null and operation_id is null and result is null))
);
create index import_batches_creator on import_batches(creator_id,created_at desc);

-- Committed batches are immutable evidence: only the preview -> committed transition is permitted.
create or replace function import_batches_immutable() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then
  if old.status='COMMITTED' then raise exception 'committed import batches are immutable' using errcode='23514'; end if;
  return old;
 end if;
 if old.status='COMMITTED' then raise exception 'committed import batches are immutable' using errcode='23514'; end if;
 if new.id<>old.id or new.creator_id<>old.creator_id or new.kind<>old.kind or new.template_version<>old.template_version or new.sha256<>old.sha256 or new.staged<>old.staged or new.created_at<>old.created_at then
  raise exception 'staged import content is immutable' using errcode='23514';
 end if;
 return new;
end $$;
create trigger import_batches_immutable before update or delete on import_batches for each row execute function import_batches_immutable();

-- Opening-debt duplicate detection reads imported obligations by child/category; source_reference keeps the batch/row label.
create index obligations_import_source on obligations(child_id,category_id) where source_reference like 'import/%';
