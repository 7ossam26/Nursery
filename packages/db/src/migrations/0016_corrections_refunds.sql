-- Reasoned financial changes append source-linked records; settled source rows remain immutable.
create table financial_corrections (
 id uuid primary key,target_kind text not null check(target_kind in ('RECEIPT','EXPENSE','TRANSFER','TUITION')),
 target_id uuid not null,action text not null check(action in ('REVERSAL','REPLACEMENT','REDUCTION')),
 effective_on date not null,reason text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,
 created_at timestamptz not null default now(),foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
alter table receipt_allocations drop constraint receipt_allocations_receipt_id_installment_id_key;
alter table receipt_allocations drop constraint receipt_allocations_reverses_id_key;
alter table receipt_allocations add column correction_id uuid references financial_corrections(id);
alter table receipt_allocations add constraint receipt_allocation_correction_check check((amount>0 and reverses_id is null) or (amount<0 and reverses_id is not null and correction_id is not null));
create unique index receipt_original_allocation on receipt_allocations(receipt_id,installment_id) where reverses_id is null;
create index receipt_allocation_reversals on receipt_allocations(reverses_id);
alter table credit_allocations drop constraint credit_allocations_reverses_id_key;
alter table credit_allocations add column correction_id uuid references financial_corrections(id);
alter table credit_allocations add constraint credit_allocation_correction_check check((amount>0 and reverses_id is null) or (amount<0 and reverses_id is not null and correction_id is not null));
create index credit_allocation_reversals on credit_allocations(reverses_id);
alter table obligation_adjustments add column correction_id uuid unique references financial_corrections(id);

create table receipt_corrections (
 correction_id uuid primary key references financial_corrections(id),original_receipt_id uuid not null unique references receipts(id),replacement_receipt_id uuid unique references receipts(id),
 check(original_receipt_id<>replacement_receipt_id)
);
create table expense_corrections (
 correction_id uuid primary key references financial_corrections(id),original_settlement_id uuid not null unique references expense_settlements(id),
 replacement_account_id uuid references treasury_accounts(id),replacement_amount bigint check(replacement_amount>0),replacement_method text check(replacement_method in ('CASH','BANK','WALLET')),external_reference text,
 check((replacement_account_id is null and replacement_amount is null and replacement_method is null and external_reference is null) or (replacement_account_id is not null and replacement_amount is not null and replacement_method is not null and external_reference is not null))
);
create table transfer_corrections (
 correction_id uuid primary key references financial_corrections(id),original_transfer_id uuid not null unique references account_transfers(id),
 replacement_source_account_id uuid references treasury_accounts(id),replacement_destination_account_id uuid references treasury_accounts(id),replacement_amount bigint check(replacement_amount>0),external_reference text,
 check((replacement_source_account_id is null and replacement_destination_account_id is null and replacement_amount is null and external_reference is null) or
 (replacement_source_account_id is not null and replacement_destination_account_id is not null and replacement_source_account_id<>replacement_destination_account_id and replacement_amount is not null and external_reference is not null))
);
create table tuition_corrections (
 correction_id uuid primary key references financial_corrections(id),installment_id uuid not null references installments(id),adjustment_id uuid not null unique references obligation_adjustments(id),
 reduction_amount bigint not null check(reduction_amount>0),remaining_before bigint not null check(remaining_before>=0),restored_credit_amount bigint not null check(restored_credit_amount>=0),new_credit_id uuid,
 check(reduction_amount>=restored_credit_amount)
);

-- Credits may originate in an external credit receipt or in paid tuition released by a reduction.
alter table credits alter column receipt_id drop not null;
alter table credits drop constraint credits_receipt_id_key;
alter table credits add column correction_id uuid unique references financial_corrections(id);
alter table credits add constraint credit_source_kind check((receipt_id is not null and correction_id is null) or (receipt_id is null and correction_id is not null));
alter table tuition_corrections add foreign key(new_credit_id) references credits(id);
create unique index credit_receipt_source on credits(receipt_id) where receipt_id is not null;
create table credit_origins (
 id uuid primary key,credit_id uuid not null references credits(id),receipt_id uuid not null,account_id uuid not null,amount bigint not null check(amount>0),
 foreign key(receipt_id,account_id) references receipts(id,account_id),unique(credit_id,receipt_id),unique(id,credit_id)
);
insert into credit_origins(id,credit_id,receipt_id,account_id,amount)
 select gen_random_uuid(),c.id,r.id,r.account_id,c.amount from credits c join receipts r on r.id=c.receipt_id;

create table refunds (
 id uuid primary key,credit_id uuid not null references credits(id),credit_origin_id uuid not null,original_receipt_id uuid not null,original_account_id uuid not null,
 funding_account_id uuid not null,funding_branch_id uuid not null references branches(id),amount bigint not null check(amount>0),method text not null check(method in ('CASH','BANK','WALLET')),
 refunded_on date not null,reason text not null,external_reference text not null,alternative_account_confirmed boolean not null,
 actor_id uuid not null references accounts(id),operation_id uuid not null,foreign key(credit_origin_id,credit_id) references credit_origins(id,credit_id),
 foreign key(original_receipt_id,original_account_id) references receipts(id,account_id),foreign key(funding_account_id,funding_branch_id) references treasury_accounts(id,branch_id),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 check(funding_account_id=original_account_id or alternative_account_confirmed)
);
create index refunds_credit on refunds(credit_id,id);
create index refunds_origin on refunds(credit_origin_id,id);

alter table treasury_movements add column correction_id uuid references financial_corrections(id);
alter table treasury_movements add column correction_leg text check(correction_leg in ('RECEIPT_REVERSAL','EXPENSE_REVERSAL','EXPENSE_REPLACEMENT','TRANSFER_REVERSAL_SOURCE','TRANSFER_REVERSAL_DESTINATION','TRANSFER_REPLACEMENT_SOURCE','TRANSFER_REPLACEMENT_DESTINATION'));
alter table treasury_movements add column source_receipt_id uuid references receipts(id);
alter table treasury_movements add column refund_id uuid unique references refunds(id);
alter table treasury_movements drop constraint treasury_movements_source_check;
alter table treasury_movements add constraint treasury_movements_source_check check(
 (correction_id is null and correction_leg is null and source_receipt_id is null and refund_id is null and closing_adjustment_id is null and (
  (kind='OPENING_BALANCE' and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
  or (kind='RECEIPT' and receipt_id is not null and amount>0 and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
  or (kind='EXPENSE' and receipt_id is null and amount<0 and expense_settlement_id is not null and transfer_id is null and transfer_leg is null)
  or (kind='TRANSFER' and receipt_id is null and expense_settlement_id is null and transfer_id is not null and transfer_leg is not null and ((transfer_leg='SOURCE' and amount<0) or (transfer_leg='DESTINATION' and amount>0)))
 ))
 or (kind='CLOSING_ADJUSTMENT' and closing_adjustment_id is not null and amount<>0 and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and correction_id is null and correction_leg is null and source_receipt_id is null and refund_id is null)
 or (kind='REFUND' and refund_id is not null and amount<0 and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and closing_adjustment_id is null and correction_id is null and correction_leg is null and source_receipt_id is null)
 or (kind='CORRECTION' and correction_id is not null and correction_leg is not null and refund_id is null and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and closing_adjustment_id is null and
   ((correction_leg='RECEIPT_REVERSAL' and source_receipt_id is not null and amount<0)
    or (correction_leg='EXPENSE_REVERSAL' and source_receipt_id is null and amount>0)
    or (correction_leg='EXPENSE_REPLACEMENT' and source_receipt_id is null and amount<0)
    or (correction_leg='TRANSFER_REVERSAL_SOURCE' and source_receipt_id is null and amount>0)
    or (correction_leg='TRANSFER_REVERSAL_DESTINATION' and source_receipt_id is null and amount<0)
    or (correction_leg='TRANSFER_REPLACEMENT_SOURCE' and source_receipt_id is null and amount<0)
    or (correction_leg='TRANSFER_REPLACEMENT_DESTINATION' and source_receipt_id is null and amount>0)))
);
create unique index treasury_correction_leg on treasury_movements(correction_id,correction_leg) where correction_id is not null;

drop view credit_balances;
create view credit_balances as select c.id,c.amount::numeric
 -coalesce((select sum(a.amount) from credit_allocations a where a.credit_id=c.id),0)
 -coalesce((select sum(r.amount) from refunds r where r.credit_id=c.id),0) as remaining from credits c;
create view credit_origin_balances as select o.*,o.amount::numeric-coalesce((select sum(r.amount) from refunds r where r.credit_origin_id=o.id),0) as remaining from credit_origins o;
create view receipt_effective_states as select r.*,case when c.correction_id is null then 'ACTIVE' else case when c.replacement_receipt_id is null then 'REVERSED' else 'REPLACED' end end as correction_state,c.correction_id,c.replacement_receipt_id
 from receipts r left join receipt_corrections c on c.original_receipt_id=r.id;
create or replace view expense_states as select e.*,
 case when s.id is not null and fc.action='REVERSAL' then 'REVERSED' when s.id is not null and fc.action='REPLACEMENT' then 'CORRECTED' when s.id is not null then 'PAID'
 when exists(select 1 from expense_approval_events v where v.expense_id=e.id and v.kind='CANCELLED') then 'CANCELLED'
 when exists(select 1 from expense_approval_events v where v.expense_id=e.id and v.kind='APPROVED') then 'APPROVED' else 'PENDING' end as state,
 s.id as settlement_id,case when fc.action='REVERSAL' then null when fc.action='REPLACEMENT' then ec.replacement_account_id else s.account_id end as account_id,
 case when fc.action='REVERSAL' then null when fc.action='REPLACEMENT' then ec.replacement_method else s.method end as method,
 case when fc.action='REVERSAL' then null when fc.action='REPLACEMENT' then fc.effective_on else s.paid_on end as paid_on,
 case when fc.action='REVERSAL' then 0 when fc.action='REPLACEMENT' then ec.replacement_amount else s.amount end as paid_amount,fc.id as correction_id,fc.reason as correction_reason
 from expenses e left join expense_settlements s on s.expense_id=e.id left join expense_corrections ec on ec.original_settlement_id=s.id left join financial_corrections fc on fc.id=ec.correction_id;

-- Signed reversals may be partial across several corrections, but never exceed their immutable source.
create function validate_allocation_reversal() returns trigger language plpgsql as $$
declare source_amount bigint; source_receipt uuid; source_credit uuid; source_installment uuid; reversed numeric; begin
 if new.reverses_id is null then return null; end if;
 if tg_table_name='receipt_allocations' then
  select amount,receipt_id,installment_id into source_amount,source_receipt,source_installment from receipt_allocations where id=new.reverses_id and reverses_id is null;
  select -coalesce(sum(amount),0) into reversed from receipt_allocations where reverses_id=new.reverses_id;
  if source_amount is null or new.receipt_id<>source_receipt or new.installment_id<>source_installment or reversed>source_amount then raise check_violation using message='Invalid receipt allocation reversal'; end if;
 else
  select amount,credit_id,installment_id into source_amount,source_credit,source_installment from credit_allocations where id=new.reverses_id and reverses_id is null;
  select -coalesce(sum(amount),0) into reversed from credit_allocations where reverses_id=new.reverses_id;
  if source_amount is null or new.credit_id<>source_credit or new.installment_id<>source_installment or reversed>source_amount then raise check_violation using message='Invalid credit allocation reversal'; end if;
 end if; return null;
end $$;
create constraint trigger receipt_allocation_reversal after insert on receipt_allocations deferrable initially deferred for each row execute function validate_allocation_reversal();
create constraint trigger credit_allocation_reversal after insert on credit_allocations deferrable initially deferred for each row execute function validate_allocation_reversal();

create function validate_credit_source_and_balance() returns trigger language plpgsql as $$
declare credit uuid:=case when tg_table_name='credits' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'credit_id')::uuid end; begin
 if not exists(select 1 from credits c where c.id=credit and c.amount=(select coalesce(sum(o.amount),0) from credit_origins o where o.credit_id=c.id)) then raise check_violation using message='Invalid credit origins'; end if;
 if exists(select 1 from credit_balances b where b.id=credit and b.remaining<0) or exists(select 1 from credit_origin_balances b where b.credit_id=credit and b.remaining<0) then raise check_violation using message='Credit is overused'; end if;
 return null;
end $$;
create constraint trigger credit_source_balance after insert on credits deferrable initially deferred for each row execute function validate_credit_source_and_balance();
create constraint trigger credit_origin_balance after insert on credit_origins deferrable initially deferred for each row execute function validate_credit_source_and_balance();
create constraint trigger credit_application_balance after insert on credit_allocations deferrable initially deferred for each row execute function validate_credit_source_and_balance();
create constraint trigger refund_credit_balance after insert on refunds deferrable initially deferred for each row execute function validate_credit_source_and_balance();

create function validate_refund_source() returns trigger language plpgsql as $$ declare source_id uuid:=case when tg_table_name='refunds' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'refund_id')::uuid end; begin
 if not exists(select 1 from refunds r join credit_origins o on o.id=r.credit_origin_id and o.credit_id=r.credit_id join receipts original on original.id=o.receipt_id and original.account_id=o.account_id
  join treasury_accounts funding on funding.id=r.funding_account_id and funding.branch_id=r.funding_branch_id
  where r.id=source_id and r.original_receipt_id=o.receipt_id and r.original_account_id=o.account_id and r.method=funding.type
  and (r.funding_account_id=r.original_account_id or r.alternative_account_confirmed)
  and (select count(*) from treasury_movements m where m.refund_id=r.id and m.kind='REFUND' and m.account_id=r.funding_account_id and m.amount=-r.amount and m.effective_on=r.refunded_on)=1)
 then raise check_violation using message='Invalid refund source'; end if; return null;
end $$;
create constraint trigger refund_source after insert on refunds deferrable initially deferred for each row execute function validate_refund_source();
create constraint trigger refund_movement_source after insert on treasury_movements deferrable initially deferred for each row when(new.kind='REFUND') execute function validate_refund_source();

create function validate_financial_correction() returns trigger language plpgsql as $$
declare correction uuid:=case when tg_table_name='financial_corrections' then (to_jsonb(new)->>'id')::uuid else coalesce(to_jsonb(new)->>'correction_id','00000000-0000-0000-0000-000000000000')::uuid end; c financial_corrections; begin
 select * into c from financial_corrections where id=correction;
 if c.id is null then raise check_violation using message='Missing financial correction'; end if;
 if c.target_kind='RECEIPT' then
  if c.action not in ('REVERSAL','REPLACEMENT') or not exists(select 1 from receipt_corrections d join receipts r on r.id=d.original_receipt_id and r.kind='PAYMENT' where d.correction_id=c.id and c.target_id=r.id and (d.replacement_receipt_id is null)=(c.action='REVERSAL')
   and (select count(*) from treasury_movements m where m.correction_id=c.id)=1
   and exists(select 1 from treasury_movements m where m.correction_id=c.id and m.correction_leg='RECEIPT_REVERSAL' and m.source_receipt_id=r.id and m.account_id=r.account_id and m.amount=-r.amount and m.effective_on=c.effective_on)
   and not exists(select 1 from receipt_allocations a where a.receipt_id=r.id and a.reverses_id is null and a.amount<>-(select coalesce(sum(x.amount),0) from receipt_allocations x where x.reverses_id=a.id and x.correction_id=c.id))) then raise check_violation using message='Invalid receipt correction'; end if;
 elsif c.target_kind='EXPENSE' then
  if c.action not in ('REVERSAL','REPLACEMENT') or not exists(select 1 from expense_corrections d join expense_settlements s on s.id=d.original_settlement_id where d.correction_id=c.id and c.target_id=s.id and (d.replacement_account_id is null)=(c.action='REVERSAL')
   and exists(select 1 from treasury_movements m where m.correction_id=c.id and m.correction_leg='EXPENSE_REVERSAL' and m.account_id=s.account_id and m.amount=s.amount and m.effective_on=c.effective_on)
   and ((c.action='REVERSAL' and (select count(*) from treasury_movements m where m.correction_id=c.id)=1) or (c.action='REPLACEMENT' and (select count(*) from treasury_movements m where m.correction_id=c.id)=2 and exists(select 1 from treasury_movements m join treasury_accounts a on a.id=d.replacement_account_id where m.correction_id=c.id and m.correction_leg='EXPENSE_REPLACEMENT' and m.account_id=d.replacement_account_id and m.amount=-d.replacement_amount and m.effective_on=c.effective_on and a.type=d.replacement_method)))) then raise check_violation using message='Invalid expense correction'; end if;
 elsif c.target_kind='TRANSFER' then
  if c.action not in ('REVERSAL','REPLACEMENT') or not exists(select 1 from transfer_corrections d join account_transfers t on t.id=d.original_transfer_id where d.correction_id=c.id and c.target_id=t.id and (d.replacement_source_account_id is null)=(c.action='REVERSAL')
   and exists(select 1 from treasury_movements m where m.correction_id=c.id and m.correction_leg='TRANSFER_REVERSAL_SOURCE' and m.account_id=t.source_account_id and m.amount=t.amount and m.effective_on=c.effective_on)
   and exists(select 1 from treasury_movements m where m.correction_id=c.id and m.correction_leg='TRANSFER_REVERSAL_DESTINATION' and m.account_id=t.destination_account_id and m.amount=-t.amount and m.effective_on=c.effective_on)
   and ((c.action='REVERSAL' and (select count(*) from treasury_movements m where m.correction_id=c.id)=2) or (c.action='REPLACEMENT' and (select count(*) from treasury_movements m where m.correction_id=c.id)=4
    and exists(select 1 from treasury_movements m where m.correction_id=c.id and m.correction_leg='TRANSFER_REPLACEMENT_SOURCE' and m.account_id=d.replacement_source_account_id and m.amount=-d.replacement_amount and m.effective_on=c.effective_on)
    and exists(select 1 from treasury_movements m where m.correction_id=c.id and m.correction_leg='TRANSFER_REPLACEMENT_DESTINATION' and m.account_id=d.replacement_destination_account_id and m.amount=d.replacement_amount and m.effective_on=c.effective_on)))) then raise check_violation using message='Invalid transfer correction'; end if;
 else
  if c.action<>'REDUCTION' or not exists(select 1 from tuition_corrections d join obligation_adjustments a on a.id=d.adjustment_id join installments i on i.id=d.installment_id join obligations o on o.id=i.obligation_id
   where d.correction_id=c.id and c.target_id=i.id and o.category_kind='TUITION' and a.correction_id=c.id and a.installment_id=i.id and a.amount=-d.reduction_amount
   and greatest(d.reduction_amount-d.remaining_before,0)=d.restored_credit_amount+coalesce((select amount from credits where id=d.new_credit_id),0)
   and d.restored_credit_amount=-(select coalesce(sum(x.amount),0) from credit_allocations x where x.correction_id=c.id)
   and coalesce((select amount from credits where id=d.new_credit_id),0)=-(select coalesce(sum(x.amount),0) from receipt_allocations x where x.correction_id=c.id)
   and (select remaining from installment_balances where id=i.id)>=0 and not exists(select 1 from treasury_movements m where m.correction_id=c.id)) then raise check_violation using message='Invalid tuition reduction'; end if;
 end if; return null;
end $$;
create constraint trigger financial_correction_source after insert on financial_corrections deferrable initially deferred for each row execute function validate_financial_correction();
create constraint trigger receipt_correction_source after insert on receipt_corrections deferrable initially deferred for each row execute function validate_financial_correction();
create constraint trigger expense_correction_source after insert on expense_corrections deferrable initially deferred for each row execute function validate_financial_correction();
create constraint trigger transfer_correction_source after insert on transfer_corrections deferrable initially deferred for each row execute function validate_financial_correction();
create constraint trigger tuition_correction_source after insert on tuition_corrections deferrable initially deferred for each row execute function validate_financial_correction();
create constraint trigger correction_movement_source after insert on treasury_movements deferrable initially deferred for each row when(new.kind='CORRECTION') execute function validate_financial_correction();

do $$ declare t text; begin
 foreach t in array array['financial_corrections','receipt_corrections','expense_corrections','transfer_corrections','tuition_corrections','credit_origins','refunds'] loop
  execute format('create trigger %I before update or delete on %I for each row execute function preserve_learning_history()',t||'_immutable',t);
 end loop;
end $$;
