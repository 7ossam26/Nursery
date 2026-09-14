insert into capabilities(key,reserved) values ('treasury.close',false);
create table daily_closings (
 id uuid primary key,account_id uuid not null references treasury_accounts(id),business_date date not null,revision integer not null check(revision>0),
 action text not null check(action in ('COUNTED','REOPENED')),expected numeric not null,counted bigint not null check(counted>=0),difference numeric generated always as (counted::numeric-expected) stored,
 supersedes_id uuid unique references daily_closings(id),reason text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 unique(account_id,business_date,revision),check((revision=1 and supersedes_id is null and action='COUNTED') or (revision>1 and supersedes_id is not null))
);
create view daily_closing_heads as select distinct on (account_id,business_date) * from daily_closings order by account_id,business_date,revision desc;
create function treasury_balance_on(account uuid,business_date date) returns numeric language sql stable as $$
 select coalesce(sum(amount),0) from treasury_movements where account_id=account and effective_on<=business_date;
$$;
create table closing_adjustments (
 id uuid primary key,closing_id uuid not null unique references daily_closings(id),account_id uuid not null references treasury_accounts(id),amount bigint not null check(amount<>0),
 effective_on date not null,reason text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
alter table treasury_movements add column closing_adjustment_id uuid unique references closing_adjustments(id);
alter table treasury_movements drop constraint treasury_movements_source_check;
alter table treasury_movements add constraint treasury_movements_source_check check(
 (closing_adjustment_id is null and (
 (kind='OPENING_BALANCE' and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
 or (kind='RECEIPT' and receipt_id is not null and amount>0 and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
 or (kind='EXPENSE' and receipt_id is null and amount<0 and expense_settlement_id is not null and transfer_id is null and transfer_leg is null)
 or (kind='TRANSFER' and receipt_id is null and expense_settlement_id is null and transfer_id is not null and transfer_leg is not null and ((transfer_leg='SOURCE' and amount<0) or (transfer_leg='DESTINATION' and amount>0)))
 )) or (kind='CLOSING_ADJUSTMENT' and closing_adjustment_id is not null and amount<>0 and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
);
-- The guard is shared by every real cash writer, including existing receipt/opening paths.
-- Lock the same account row as services before inspecting active counted dates.
create function guard_counted_cash() returns trigger language plpgsql as $$
declare opened date; exempt_closing uuid; begin
 select opened_on into opened from treasury_accounts where id=new.account_id for update;
 if new.effective_on<opened or new.effective_on>(now() at time zone 'Africa/Cairo')::date then raise check_violation using message='Invalid movement business date'; end if;
 if new.kind='CLOSING_ADJUSTMENT' then
  select c.id into exempt_closing from closing_adjustments a join daily_closing_heads c on c.id=a.closing_id
   where a.id=new.closing_adjustment_id and c.action='COUNTED' and a.account_id=c.account_id and new.account_id=a.account_id and new.amount=a.amount
   and a.amount=c.difference and new.effective_on=a.effective_on and a.effective_on=(now() at time zone 'Africa/Cairo')::date and a.effective_on>=c.business_date;
  if exempt_closing is null then raise check_violation using message='Invalid closing adjustment source'; end if;
 end if;
 if exists(select 1 from daily_closing_heads c where c.account_id=new.account_id and c.action='COUNTED' and c.business_date>=new.effective_on and (exempt_closing is null or c.id<>exempt_closing)) then raise check_violation using message='Counted date requires reopen or current-date correction'; end if;
 return new;
end $$;
create trigger treasury_counted_date before insert on treasury_movements for each row execute function guard_counted_cash();
create function guard_closing_revision() returns trigger language plpgsql as $$
declare old daily_closings; begin
 perform id from treasury_accounts where id=new.account_id for update;
 if not exists(select 1 from treasury_accounts where id=new.account_id and type='CASH') then raise check_violation using message='Only cash accounts have counted closings'; end if;
 select * into old from daily_closing_heads where account_id=new.account_id and business_date=new.business_date;
 if new.business_date>(now() at time zone 'Africa/Cairo')::date or new.business_date<(select opened_on from treasury_accounts where id=new.account_id) then raise check_violation using message='Invalid closing date'; end if;
 if old.id is null then
  if new.revision<>1 or new.action<>'COUNTED' then raise check_violation using message='Invalid first closing revision'; end if;
 else
  if new.revision<>old.revision+1 or new.supersedes_id<>old.id or new.action=old.action then raise check_violation using message='Invalid closing successor'; end if;
  if new.action='REOPENED' and (new.expected<>old.expected or new.counted<>old.counted) then raise check_violation using message='Reopen must preserve original count'; end if;
 end if;
 if new.action='COUNTED' and new.expected<>treasury_balance_on(new.account_id,new.business_date) then raise check_violation using message='Invalid expected cash'; end if;
 return new;
end $$;
create trigger closing_revision before insert on daily_closings for each row execute function guard_closing_revision();
create function validate_closing_adjustment() returns trigger language plpgsql as $$ begin
 if not exists(select 1 from treasury_movements m where m.closing_adjustment_id=new.id and m.kind='CLOSING_ADJUSTMENT' and m.account_id=new.account_id and m.amount=new.amount and m.effective_on=new.effective_on) then raise check_violation using message='Missing closing adjustment movement'; end if; return null;
end $$;
create constraint trigger closing_adjustment_source after insert on closing_adjustments deferrable initially deferred for each row execute function validate_closing_adjustment();
create trigger daily_closings_immutable before update or delete on daily_closings for each row execute function preserve_learning_history();
create trigger closing_adjustments_immutable before update or delete on closing_adjustments for each row execute function preserve_learning_history();
