-- Original obligations/receipts stay immutable. Ownership is a separate append-only chain.
create table child_branch_transfers (
 id uuid primary key, sequence bigint generated always as identity unique,
 child_id uuid not null references children(id), child_code text not null, child_name text not null,
 source_branch_id uuid not null references branches(id), destination_branch_id uuid not null references branches(id),
 source_classroom_id uuid references classrooms(id), destination_classroom_id uuid references classrooms(id),
 effective_on date not null, amount numeric(30,0) not null check(amount>=0), reason text not null,
 actor_id uuid not null references accounts(id), operation_id uuid not null,
 check(source_branch_id<>destination_branch_id), unique(actor_id,operation_id),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 foreign key(destination_classroom_id,destination_branch_id) references classrooms(id,branch_id)
);
create index child_branch_transfer_history on child_branch_transfers(child_id,sequence desc);
alter table receipt_allocations add column ownership_transfer_id uuid references child_branch_transfers(id);
alter table tuition_corrections add column ownership_transfer_id uuid references child_branch_transfers(id);
create table receivable_ownership (
 obligation_id uuid not null references obligations(id), transfer_id uuid not null references child_branch_transfers(id),
 primary key(obligation_id,transfer_id)
);
create table transferred_due_items (
 transfer_id uuid not null references child_branch_transfers(id), installment_id uuid not null references installments(id),
 amount numeric(30,0) not null check(amount>0), due_on date not null,
 primary key(transfer_id,installment_id)
);
-- Zero balances also retain an ownership anchor: a later authorized receipt reversal
-- restores debt at the committed owner, without pretending zero debt was transferred.
create view receivable_obligations as
 select o.id,o.child_id,coalesce(t.destination_branch_id,o.branch_id) as branch_id,
 case when t.id is null then o.classroom_id else t.destination_classroom_id end as classroom_id,
 o.category_id,o.category_name,o.category_kind,o.child_code,o.child_name,o.amount,o.description,o.source_reference,
 o.issued_on,o.service_from,o.service_until,o.actor_id,
 o.branch_id as original_branch_id,o.classroom_id as original_classroom_id,t.id as transfer_id,t.effective_on as ownership_on
 from obligations o left join lateral (
  select t.* from receivable_ownership h join child_branch_transfers t on t.id=h.transfer_id
  where h.obligation_id=o.id order by t.sequence desc limit 1
 ) t on true;
create function validate_child_branch_transfer() returns trigger language plpgsql as $$
declare t child_branch_transfers; target uuid;
begin
 target=case when tg_table_name='child_branch_transfers' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'transfer_id')::uuid end;
 select * into t from child_branch_transfers where id=target;
 if t.amount<>(select coalesce(sum(amount),0) from transferred_due_items where transfer_id=t.id)
 or exists(select 1 from transferred_due_items x join installments i on i.id=x.installment_id join obligations o on o.id=i.obligation_id
  where x.transfer_id=t.id and (o.child_id<>t.child_id or x.due_on<>i.due_on or not exists(select 1 from receivable_ownership h where h.transfer_id=t.id and h.obligation_id=o.id)))
 or exists(select 1 from receivable_ownership h join obligations o on o.id=h.obligation_id where h.transfer_id=t.id and o.child_id<>t.child_id)
 then raise check_violation using message='Invalid child debt transfer'; end if;
 return null;
end $$;
create function validate_allocation_owner() returns trigger language plpgsql as $$
declare owner_branch uuid; owner_transfer uuid;
begin
 if new.reverses_id is not null then
  select ownership_transfer_id into new.ownership_transfer_id from receipt_allocations where id=new.reverses_id;
 else
  select o.branch_id,o.transfer_id into owner_branch,owner_transfer from installments i join receivable_obligations o on o.id=i.obligation_id where i.id=new.installment_id;
  if owner_branch<>(select branch_id from receipts where id=new.receipt_id) then raise check_violation using message='Receipt must use current receivable owner'; end if;
  new.ownership_transfer_id=owner_transfer;
 end if;
 return new;
end $$;
create trigger receipt_allocation_owner before insert on receipt_allocations for each row execute function validate_allocation_owner();
create function snapshot_tuition_correction_owner() returns trigger language plpgsql as $$
begin
 select o.transfer_id into new.ownership_transfer_id from installments i join receivable_obligations o on o.id=i.obligation_id where i.id=new.installment_id;
 return new;
end $$;
create trigger tuition_correction_owner before insert on tuition_corrections for each row execute function snapshot_tuition_correction_owner();
create or replace function preserve_child_branch() returns trigger language plpgsql as $$
begin
 if new.branch_id<>old.branch_id and not exists (
  select 1 from child_branch_transfers t where t.child_id=old.id and t.source_branch_id=old.branch_id
  and t.destination_branch_id=new.branch_id and t.destination_classroom_id is not distinct from new.classroom_id
  and t.sequence=(select max(sequence) from child_branch_transfers where child_id=old.id)
  and t.effective_on=(current_timestamp at time zone 'Africa/Cairo')::date
  and not exists(select 1 from financial_operations f where f.actor_id=t.actor_id and f.operation_id=t.operation_id)
 ) then raise check_violation using message='Branch changes require an atomic child transfer'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['child_branch_transfers','receivable_ownership','transferred_due_items'] loop
  execute format('create trigger %I before update or delete on %I for each row execute function preserve_learning_history()',t||'_immutable',t);
  execute format('create constraint trigger %I after insert on %I deferrable initially deferred for each row execute function validate_child_branch_transfer()',t||'_complete',t);
 end loop;
end $$;
