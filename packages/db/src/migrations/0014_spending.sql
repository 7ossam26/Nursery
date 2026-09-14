insert into capabilities(key,reserved) values ('expenses.manage',false),('expenses.pay',false),('expenses.approve',false);
create table expense_settings (
 singleton boolean primary key default true check(singleton),approval_threshold bigint not null default 0 check(approval_threshold>=0),
 approving_capability text not null default 'expenses.approve' references capabilities(key),version integer not null default 1 check(version>0)
);
insert into expense_settings(singleton) values(true);
create table expense_categories (id uuid primary key,code text not null unique check(code not in ('SALARY','PAYROLL','ADVANCE')),name text not null);
create table expenses (
 id uuid primary key,branch_id uuid not null references branches(id),classroom_id uuid references classrooms(id),category_id uuid not null references expense_categories(id),
 category_name text not null,amount bigint not null check(amount>0),due_on date not null,note text not null,
 actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(id,branch_id)
);
create index expenses_scope on expenses(branch_id,classroom_id,due_on,id);
create table expense_documents (
 id uuid primary key,expense_id uuid not null references expenses(id),name text not null,expires_on date,storage_key uuid not null unique,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),byte_size integer not null check(byte_size>0 and byte_size<=5242880),sha256 text not null,
 actor_id uuid not null references accounts(id),operation_id uuid not null,
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
create table expense_document_retirements (
 document_id uuid primary key references expense_documents(id),reason text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
create table expense_approval_events (
 id uuid primary key,expense_id uuid not null references expenses(id),kind text not null check(kind in ('APPROVED','CANCELLED')),
 approving_capability text references capabilities(key),reason text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,
 created_at timestamptz not null default now(),foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 unique(expense_id,kind),check((kind='APPROVED' and approving_capability is not null) or (kind='CANCELLED' and approving_capability is null))
);
create table expense_settlements (
 id uuid primary key,expense_id uuid not null unique references expenses(id),branch_id uuid not null,account_id uuid not null,
 amount bigint not null check(amount>0),method text not null check(method in ('CASH','BANK','WALLET')),paid_on date not null,reason text not null,external_reference text not null,
 actor_id uuid not null references accounts(id),operation_id uuid not null,
 foreign key(expense_id,branch_id) references expenses(id,branch_id),foreign key(account_id,branch_id) references treasury_accounts(id,branch_id),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
create table account_transfers (
 id uuid primary key,source_account_id uuid not null references treasury_accounts(id),destination_account_id uuid not null references treasury_accounts(id),
 amount bigint not null check(amount>0),effective_on date not null,reason text not null,external_reference text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,
 check(source_account_id<>destination_account_id),foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
-- Keep the existing immutable movement ledger and give each new leg a real source.
alter table treasury_movements drop constraint treasury_movements_kind_check;
alter table treasury_movements drop constraint treasury_movements_check;
alter table treasury_movements add column expense_settlement_id uuid unique references expense_settlements(id);
alter table treasury_movements add column transfer_id uuid references account_transfers(id);
alter table treasury_movements add column transfer_leg text check(transfer_leg in ('SOURCE','DESTINATION'));
alter table treasury_movements add constraint treasury_movements_source_check check(
 (kind='OPENING_BALANCE' and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
 or (kind='RECEIPT' and receipt_id is not null and amount>0 and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
 or (kind='EXPENSE' and receipt_id is null and amount<0 and expense_settlement_id is not null and transfer_id is null and transfer_leg is null)
 or (kind='TRANSFER' and receipt_id is null and expense_settlement_id is null and transfer_id is not null and transfer_leg is not null and ((transfer_leg='SOURCE' and amount<0) or (transfer_leg='DESTINATION' and amount>0)))
);
create unique index treasury_transfer_leg on treasury_movements(transfer_id,transfer_leg) where kind='TRANSFER';
create view expense_states as select e.*,
 case when s.id is not null then 'PAID' when exists(select 1 from expense_approval_events v where v.expense_id=e.id and v.kind='CANCELLED') then 'CANCELLED'
 when exists(select 1 from expense_approval_events v where v.expense_id=e.id and v.kind='APPROVED') then 'APPROVED' else 'PENDING' end as state,
 s.id as settlement_id,s.account_id,s.method,s.paid_on from expenses e left join expense_settlements s on s.expense_id=e.id;
do $$ declare t text; begin
 foreach t in array array['expense_categories','expenses','expense_approval_events','expense_settlements','account_transfers','expense_documents','expense_document_retirements'] loop
 execute format('create trigger %I before update or delete on %I for each row execute function preserve_learning_history()',t||'_immutable',t);
 end loop;
end $$;
-- Deferred source checks allow the source and all legs to be inserted in one transaction.
create function validate_spending_source() returns trigger language plpgsql as $$
declare source_id uuid; movement_kind text:=to_jsonb(new)->>'kind'; begin
 if tg_table_name='expense_settlements' or (tg_table_name='treasury_movements' and movement_kind='EXPENSE') then
  if tg_table_name='expense_settlements' then source_id:=new.id; else source_id:=new.expense_settlement_id; end if;
  if not exists(select 1 from expense_settlements s join expenses e on e.id=s.expense_id join treasury_accounts a on a.id=s.account_id
   where s.id=source_id and s.amount=e.amount and a.type=s.method and s.paid_on>=a.opened_on and
   not exists(select 1 from expense_approval_events v where v.expense_id=e.id and v.kind='CANCELLED') and
   (select count(*) from treasury_movements m where m.expense_settlement_id=s.id and m.kind='EXPENSE' and m.account_id=s.account_id and m.amount=-s.amount and m.effective_on=s.paid_on)=1) then raise check_violation using message='Invalid expense source'; end if;
 elsif tg_table_name='account_transfers' or (tg_table_name='treasury_movements' and movement_kind='TRANSFER') then
  if tg_table_name='account_transfers' then source_id:=new.id; else source_id:=new.transfer_id; end if;
  if not exists(select 1 from account_transfers t where t.id=source_id and
   (select count(*) from treasury_movements m where m.transfer_id=t.id)=2 and
   exists(select 1 from treasury_movements m where m.transfer_id=t.id and m.kind='TRANSFER' and m.transfer_leg='SOURCE' and m.account_id=t.source_account_id and m.amount=-t.amount and m.effective_on=t.effective_on) and
   exists(select 1 from treasury_movements m where m.transfer_id=t.id and m.kind='TRANSFER' and m.transfer_leg='DESTINATION' and m.account_id=t.destination_account_id and m.amount=t.amount and m.effective_on=t.effective_on)) then raise check_violation using message='Invalid transfer source'; end if;
 end if; return null;
end $$;
create constraint trigger expense_settlement_source after insert on expense_settlements deferrable initially deferred for each row execute function validate_spending_source();
create constraint trigger account_transfer_source after insert on account_transfers deferrable initially deferred for each row execute function validate_spending_source();
create constraint trigger treasury_spending_source after insert on treasury_movements deferrable initially deferred for each row execute function validate_spending_source();
create function validate_expense_classroom() returns trigger language plpgsql as $$ begin
 if new.classroom_id is not null and not exists(select 1 from classrooms c where c.id=new.classroom_id and c.branch_id=new.branch_id) then raise check_violation using message='Invalid expense classroom'; end if; return new;
end $$;
create trigger expense_classroom_scope before insert on expenses for each row execute function validate_expense_classroom();
