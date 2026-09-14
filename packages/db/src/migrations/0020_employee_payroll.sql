insert into capabilities(key,reserved) values ('payroll.manage',false),('payroll.pay',false);
alter table module_settings drop constraint module_settings_module_key_check;
alter table module_settings add constraint module_settings_module_key_check check(module_key in ('FINANCE','ATTENDANCE','EXAMS','HOMEWORK','HEALTH','PICKUP','INCIDENTS','CUSTOM_CHECKPOINTS','TRANSPORT','ACTIVITIES','PAYROLL'));
insert into module_settings(module_key) values ('PAYROLL');

create table employee_profiles (
 id uuid primary key,employee_code text not null unique check(employee_code ~ '^[A-Z0-9_-]{1,32}$'),full_name text not null check(length(full_name) between 1 and 160),
 account_id uuid unique references accounts(id),actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(actor_id,operation_id)
);
create table employee_profile_status_events (
 id uuid primary key,sequence bigint generated always as identity unique,employee_id uuid not null references employee_profiles(id),active boolean not null,reason text not null check(length(reason) between 1 and 500),actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(actor_id,operation_id)
);
create table employee_profile_login_links (
 id uuid primary key,employee_id uuid not null unique references employee_profiles(id),account_id uuid not null unique references accounts(id),reason text not null check(length(btrim(reason)) between 1 and 500),actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(actor_id,operation_id)
);
create view employee_profile_states as select e.id,e.employee_code,e.full_name,coalesce(e.account_id,l.account_id) as account_id,e.actor_id,e.operation_id,e.created_at,coalesce((select active from employee_profile_status_events s where s.employee_id=e.id order by s.sequence desc limit 1),true) as active from employee_profiles e left join employee_profile_login_links l on l.employee_id=e.id;

create table salary_history (
 id uuid primary key,employee_id uuid not null references employee_profiles(id),effective_month date not null check(effective_month=date_trunc('month',effective_month)::date),basic_salary bigint not null check(basic_salary>0),
 paying_branch_id uuid not null references branches(id),paying_account_id uuid not null,reason text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(paying_account_id,paying_branch_id) references treasury_accounts(id,branch_id),foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 unique(employee_id,effective_month),unique(actor_id,operation_id)
);
create index salary_history_employee_month on salary_history(employee_id,effective_month desc);

create table payroll_periods (
 id uuid primary key,employee_id uuid not null references employee_profiles(id),month date not null check(month=date_trunc('month',month)::date),employee_code text not null,employee_name text not null,
 paying_branch_id uuid not null references branches(id),paying_account_id uuid not null,basic_salary bigint not null check(basic_salary>0),actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(paying_account_id,paying_branch_id) references treasury_accounts(id,branch_id),foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 unique(employee_id,month),unique(actor_id,operation_id),unique(id,paying_branch_id),unique(id,paying_account_id)
);
create index payroll_period_scope on payroll_periods(paying_branch_id,month,id);
create table payroll_adjustments (
 id uuid primary key,period_id uuid not null references payroll_periods(id),kind text not null check(kind in ('ADDITION','DEDUCTION','PENALTY')),amount bigint not null check(amount>0),reason text not null,
 actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(actor_id,operation_id)
);
create table payroll_advances (
 id uuid primary key,period_id uuid not null references payroll_periods(id),branch_id uuid not null,account_id uuid not null,amount bigint not null check(amount>0),paid_on date not null,method text not null check(method in ('CASH','BANK','WALLET')),
 reason text not null,external_reference text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(period_id,branch_id) references payroll_periods(id,paying_branch_id),foreign key(period_id,account_id) references payroll_periods(id,paying_account_id),foreign key(account_id,branch_id) references treasury_accounts(id,branch_id),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(actor_id,operation_id)
);
create table payroll_final_settlements (
 id uuid primary key,period_id uuid not null unique references payroll_periods(id),branch_id uuid not null,account_id uuid,amount bigint not null check(amount>=0),settled_on date not null,method text check(method in ('CASH','BANK','WALLET')),
 reason text not null,external_reference text not null,actor_id uuid not null references accounts(id),operation_id uuid not null,created_at timestamptz not null default now(),
 foreign key(period_id,branch_id) references payroll_periods(id,paying_branch_id),foreign key(account_id,branch_id) references treasury_accounts(id,branch_id),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,unique(actor_id,operation_id),
 check((amount=0 and account_id is null and method is null) or (amount>0 and account_id is not null and method is not null))
);
create index payroll_adjustments_period on payroll_adjustments(period_id);
create index payroll_advances_period on payroll_advances(period_id);
alter table salary_history add constraint salary_reason_check check(length(btrim(reason)) between 1 and 500);
alter table payroll_adjustments add constraint adjustment_reason_check check(length(btrim(reason)) between 1 and 500);
alter table payroll_advances add constraint advance_reason_check check(length(btrim(reason)) between 1 and 500);
alter table payroll_final_settlements add constraint settlement_reason_check check(length(btrim(reason)) between 1 and 500);

create function guard_employee_account() returns trigger language plpgsql as $$ begin
 if new.account_id is not null and (not exists(select 1 from accounts where id=new.account_id and kind='STAFF') or exists(select 1 from employee_profile_login_links where account_id=new.account_id)) then raise check_violation using message='Employee login must be unique STAFF'; end if; return new;
end $$;
create trigger employee_account_guard before insert on employee_profiles for each row execute function guard_employee_account();
create function guard_employee_login_link() returns trigger language plpgsql as $$ begin
 perform id from employee_profiles where id=new.employee_id for update;
 if exists(select 1 from employee_profiles where id=new.employee_id and account_id is not null) or not exists(select 1 from accounts where id=new.account_id and kind='STAFF') or exists(select 1 from employee_profiles where account_id=new.account_id) then raise check_violation using message='Invalid employee login link'; end if; return new;
end $$;
create trigger employee_login_link_guard before insert on employee_profile_login_links for each row execute function guard_employee_login_link();

create function guard_payroll_snapshot() returns trigger language plpgsql as $$ declare employee employee_profile_states; salary salary_history; begin
 perform id from employee_profiles where id=new.employee_id for update;
 select * into employee from employee_profile_states where id=new.employee_id;
 select * into salary from salary_history where employee_id=new.employee_id and effective_month<=new.month order by effective_month desc limit 1;
 if salary.id is null or not employee.active or new.month>date_trunc('month',now() at time zone 'Africa/Cairo')::date or new.employee_code<>employee.employee_code or new.employee_name<>employee.full_name or new.basic_salary<>salary.basic_salary or new.paying_branch_id<>salary.paying_branch_id or new.paying_account_id<>salary.paying_account_id then raise check_violation using message='Invalid payroll salary snapshot'; end if; return new;
end $$;
create trigger payroll_snapshot_guard before insert on payroll_periods for each row execute function guard_payroll_snapshot();

create view payroll_period_balances as select p.*,
 coalesce((select sum(amount) from payroll_adjustments a where a.period_id=p.id and a.kind='ADDITION'),0) as additions,
 coalesce((select sum(amount) from payroll_adjustments a where a.period_id=p.id and a.kind in ('DEDUCTION','PENALTY')),0) as deductions,
 coalesce((select sum(amount) from payroll_advances a where a.period_id=p.id),0) as advances,
 p.basic_salary::numeric+coalesce((select sum(amount) from payroll_adjustments a where a.period_id=p.id and a.kind='ADDITION'),0)
 -coalesce((select sum(amount) from payroll_adjustments a where a.period_id=p.id and a.kind in ('DEDUCTION','PENALTY')),0)
 -coalesce((select sum(amount) from payroll_advances a where a.period_id=p.id),0) as remaining,
 s.id as settlement_id,s.amount as settled_amount,s.settled_on
 from payroll_periods p left join payroll_final_settlements s on s.period_id=p.id;

create function guard_salary_history() returns trigger language plpgsql as $$ declare prior_count integer; latest date; begin
 perform id from employee_profiles where id=new.employee_id for update;
 select count(*),max(effective_month) into prior_count,latest from salary_history where employee_id=new.employee_id;
 if not exists(select 1 from treasury_accounts a where a.id=new.paying_account_id and a.branch_id=new.paying_branch_id) then raise check_violation using message='Invalid salary account'; end if;
 if prior_count>0 and (new.effective_month<=date_trunc('month',now() at time zone 'Africa/Cairo')::date or new.effective_month<=latest or exists(select 1 from payroll_periods p where p.employee_id=new.employee_id and p.month>=new.effective_month)) then raise check_violation using message='Salary changes apply only to unsnapshotted future months'; end if;
 return new;
end $$;
create trigger salary_history_guard before insert on salary_history for each row execute function guard_salary_history();

create function guard_payroll_change() returns trigger language plpgsql as $$ declare p payroll_periods; used numeric; change_kind text:=to_jsonb(new)->>'kind'; begin
 select * into p from payroll_periods where id=new.period_id for update;
 if p.id is null then raise check_violation using message='Missing payroll period'; end if;
 if tg_table_name in ('payroll_adjustments','payroll_advances') then
  if exists(select 1 from payroll_final_settlements s where s.period_id=p.id) then raise check_violation using message='Settled payroll is immutable'; end if;
  if p.month<>date_trunc('month',now() at time zone 'Africa/Cairo')::date then raise check_violation using message='Adjustments and advances belong to the current month'; end if;
  if tg_table_name='payroll_advances' and ((to_jsonb(new)->>'paid_on')::date<p.month or (to_jsonb(new)->>'paid_on')::date>=(p.month+interval '1 month')::date or (to_jsonb(new)->>'paid_on')::date>(now() at time zone 'Africa/Cairo')::date) then raise check_violation using message='Invalid payroll advance date'; end if;
  select deductions+advances into used from payroll_period_balances where id=p.id;
  if tg_table_name='payroll_advances' or change_kind in ('DEDUCTION','PENALTY') then used:=used+new.amount; end if;
  if used>p.basic_salary then raise check_violation using message='Payroll deduction and advance cap exceeded'; end if;
  if change_kind='ADDITION' and (select remaining+new.amount from payroll_period_balances where id=p.id)>9223372036854775807 then raise check_violation using message='Payroll payable exceeds supported money range'; end if;
 elsif tg_table_name='payroll_final_settlements' then
  if p.month>date_trunc('month',now() at time zone 'Africa/Cairo')::date or new.settled_on<p.month or new.settled_on>(now() at time zone 'Africa/Cairo')::date then raise check_violation using message='Invalid payroll settlement date'; end if;
  if new.amount<>(select remaining from payroll_period_balances where id=p.id) then raise check_violation using message='Final payroll must equal the full remainder'; end if;
 end if;
 return new;
end $$;
create trigger payroll_adjustment_guard before insert on payroll_adjustments for each row execute function guard_payroll_change();
create trigger payroll_advance_guard before insert on payroll_advances for each row execute function guard_payroll_change();
create trigger payroll_settlement_guard before insert on payroll_final_settlements for each row execute function guard_payroll_change();

alter table treasury_movements add column payroll_advance_id uuid unique references payroll_advances(id);
alter table treasury_movements add column payroll_settlement_id uuid unique references payroll_final_settlements(id);
alter table treasury_movements drop constraint treasury_movements_source_check;
alter table treasury_movements add constraint treasury_movements_source_check check(
 (payroll_advance_id is null and payroll_settlement_id is null and correction_id is null and correction_leg is null and source_receipt_id is null and refund_id is null and closing_adjustment_id is null and (
  (kind='OPENING_BALANCE' and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
  or (kind='RECEIPT' and receipt_id is not null and amount>0 and expense_settlement_id is null and transfer_id is null and transfer_leg is null)
  or (kind='EXPENSE' and receipt_id is null and amount<0 and expense_settlement_id is not null and transfer_id is null and transfer_leg is null)
  or (kind='TRANSFER' and receipt_id is null and expense_settlement_id is null and transfer_id is not null and transfer_leg is not null and ((transfer_leg='SOURCE' and amount<0) or (transfer_leg='DESTINATION' and amount>0)))
 ))
 or (kind='CLOSING_ADJUSTMENT' and closing_adjustment_id is not null and amount<>0 and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and correction_id is null and correction_leg is null and source_receipt_id is null and refund_id is null and payroll_advance_id is null and payroll_settlement_id is null)
 or (kind='REFUND' and refund_id is not null and amount<0 and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and closing_adjustment_id is null and correction_id is null and correction_leg is null and source_receipt_id is null and payroll_advance_id is null and payroll_settlement_id is null)
 or (kind='CORRECTION' and correction_id is not null and correction_leg is not null and refund_id is null and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and closing_adjustment_id is null and payroll_advance_id is null and payroll_settlement_id is null and
   ((correction_leg='RECEIPT_REVERSAL' and source_receipt_id is not null and amount<0)
    or (correction_leg='EXPENSE_REVERSAL' and source_receipt_id is null and amount>0)
    or (correction_leg='EXPENSE_REPLACEMENT' and source_receipt_id is null and amount<0)
    or (correction_leg='TRANSFER_REVERSAL_SOURCE' and source_receipt_id is null and amount>0)
    or (correction_leg='TRANSFER_REVERSAL_DESTINATION' and source_receipt_id is null and amount<0)
    or (correction_leg='TRANSFER_REPLACEMENT_SOURCE' and source_receipt_id is null and amount<0)
    or (correction_leg='TRANSFER_REPLACEMENT_DESTINATION' and source_receipt_id is null and amount>0)))
 or (kind='PAYROLL_ADVANCE' and payroll_advance_id is not null and amount<0 and payroll_settlement_id is null and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and closing_adjustment_id is null and correction_id is null and correction_leg is null and source_receipt_id is null and refund_id is null)
 or (kind='PAYROLL_SETTLEMENT' and payroll_settlement_id is not null and amount<0 and payroll_advance_id is null and receipt_id is null and expense_settlement_id is null and transfer_id is null and transfer_leg is null and closing_adjustment_id is null and correction_id is null and correction_leg is null and source_receipt_id is null and refund_id is null)
);

create function validate_payroll_source() returns trigger language plpgsql as $$ declare source_id uuid; source_kind text:=to_jsonb(new)->>'kind'; begin
 if tg_table_name='payroll_advances' or source_kind='PAYROLL_ADVANCE' then
  source_id:=case when tg_table_name='payroll_advances' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'payroll_advance_id')::uuid end;
  if not exists(select 1 from payroll_advances a join payroll_periods p on p.id=a.period_id join treasury_accounts t on t.id=a.account_id where a.id=source_id and a.branch_id=p.paying_branch_id and a.account_id=p.paying_account_id and a.method=t.type and a.paid_on>=p.month and a.paid_on<(p.month+interval '1 month')::date and
   (select count(*) from treasury_movements m where m.payroll_advance_id=a.id and m.kind='PAYROLL_ADVANCE' and m.account_id=a.account_id and m.amount=-a.amount and m.effective_on=a.paid_on)=1) then raise check_violation using message='Invalid payroll advance source'; end if;
 elsif tg_table_name='payroll_final_settlements' or source_kind='PAYROLL_SETTLEMENT' then
  source_id:=case when tg_table_name='payroll_final_settlements' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'payroll_settlement_id')::uuid end;
  if not exists(select 1 from payroll_final_settlements s join payroll_periods p on p.id=s.period_id left join treasury_accounts t on t.id=s.account_id where s.id=source_id and s.branch_id=p.paying_branch_id and
   ((s.amount=0 and s.account_id is null and s.method is null and not exists(select 1 from treasury_movements m where m.payroll_settlement_id=s.id)) or
    (s.amount>0 and s.account_id=p.paying_account_id and s.method=t.type and (select count(*) from treasury_movements m where m.payroll_settlement_id=s.id and m.kind='PAYROLL_SETTLEMENT' and m.account_id=s.account_id and m.amount=-s.amount and m.effective_on=s.settled_on)=1))) then raise check_violation using message='Invalid payroll settlement source'; end if;
 end if; return null;
end $$;
create constraint trigger payroll_advance_source after insert on payroll_advances deferrable initially deferred for each row execute function validate_payroll_source();
create constraint trigger payroll_advance_movement_source after insert on treasury_movements deferrable initially deferred for each row when(new.kind='PAYROLL_ADVANCE') execute function validate_payroll_source();
create constraint trigger payroll_settlement_source after insert on payroll_final_settlements deferrable initially deferred for each row execute function validate_payroll_source();
create constraint trigger payroll_settlement_movement_source after insert on treasury_movements deferrable initially deferred for each row when(new.kind='PAYROLL_SETTLEMENT') execute function validate_payroll_source();

-- Actual operating expense rows derive from their payroll cash sources, never salary snapshots.
create view payroll_cash_sources as
 select a.id,'PAYROLL_ADVANCE'::text as kind,a.period_id,a.branch_id,a.account_id,a.amount,a.paid_on as effective_on,a.reason,a.actor_id,a.operation_id from payroll_advances a
 union all select s.id,'PAYROLL_SETTLEMENT',s.period_id,s.branch_id,s.account_id,s.amount,s.settled_on,s.reason,s.actor_id,s.operation_id from payroll_final_settlements s where s.amount>0;

do $$ declare t text; begin foreach t in array array['employee_profiles','employee_profile_status_events','employee_profile_login_links','salary_history','payroll_periods','payroll_adjustments','payroll_advances','payroll_final_settlements'] loop execute format('create trigger %I before update or delete on %I for each row execute function preserve_learning_history()',t||'_immutable',t); end loop; end $$;
