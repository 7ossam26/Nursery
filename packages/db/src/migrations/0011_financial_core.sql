insert into capabilities(key,reserved) values ('finance.read',false),('billing.manage',false),('payments.record',false),('treasury.manage',false);
create table financial_operations (
 actor_id uuid not null references accounts(id),operation_id uuid not null,request_hash text not null,
 action text not null,result jsonb not null,resources jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,operation_id)
);
create table treasury_accounts (
 id uuid primary key,branch_id uuid not null references branches(id),code text not null unique,name text not null,
 type text not null check(type in ('CASH','BANK','WALLET')),opened_on date not null,unique(id,branch_id)
);
create table branch_treasury_defaults (
 branch_id uuid primary key references branches(id),account_id uuid not null,version integer not null check(version>0),
 foreign key(account_id,branch_id) references treasury_accounts(id,branch_id)
);
create table fee_categories (id uuid primary key,code text not null unique,name text not null,kind text not null check(kind in ('TUITION','BUS','TRIP','ADDITIONAL')));
create table obligations (
 id uuid primary key,child_id uuid not null references children(id),branch_id uuid not null references branches(id),classroom_id uuid references classrooms(id),
 category_id uuid not null references fee_categories(id),category_name text not null,category_kind text not null check(category_kind in ('TUITION','BUS','TRIP','ADDITIONAL')),
 child_code text not null,child_name text not null,amount bigint not null check(amount>=0),description text not null,source_reference text not null,
 issued_on date not null,service_from date,service_until date,actor_id uuid not null references accounts(id),
 check((service_from is null and service_until is null) or (service_from is not null and service_until is not null and service_until>=service_from)),
 unique(child_id,source_reference)
);
create index obligations_scope on obligations(branch_id,classroom_id,child_id);
create table installments (
 id uuid primary key,obligation_id uuid not null references obligations(id),position integer not null check(position>0),due_on date not null,
 amount bigint not null check(amount>=0),unique(obligation_id,position)
);
create sequence financial_receipt_number;
create table receipts (
 id uuid primary key,reference text not null unique,actor_id uuid not null references accounts(id),operation_id uuid not null,
 branch_id uuid not null references branches(id),branch_code text not null,account_id uuid not null,account_code text not null,
 method text not null check(method in ('CASH','BANK','WALLET')),collected_on date not null,payer_name text not null,external_reference text not null,
 amount bigint not null check(amount>0),kind text not null check(kind in ('PAYMENT','CREDIT')),lines jsonb not null,
 foreign key(account_id,branch_id) references treasury_accounts(id,branch_id),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred,
 unique(actor_id,operation_id,branch_id),unique(id,account_id)
);
create index receipts_scope on receipts(branch_id,collected_on,id);
create table receipt_allocations (
 id uuid primary key,receipt_id uuid not null references receipts(id),installment_id uuid not null references installments(id),
 amount bigint not null check(amount<>0),reverses_id uuid unique references receipt_allocations(id),
 check((reverses_id is null and amount>0) or (reverses_id is not null and amount<0)),unique(receipt_id,installment_id)
);
create index receipt_allocations_due on receipt_allocations(installment_id);
create table credits (
 id uuid primary key,child_id uuid not null references children(id),branch_id uuid not null references branches(id),
 receipt_id uuid not null unique references receipts(id),amount bigint not null check(amount>0),reason text not null,created_on date not null
);
create table credit_allocations (
 id uuid primary key,credit_id uuid not null references credits(id),installment_id uuid not null references installments(id),
 amount bigint not null check(amount<>0),applied_on date not null,reverses_id uuid unique references credit_allocations(id),
 check((reverses_id is null and amount>0) or (reverses_id is not null and amount<0))
);
create index credit_allocations_due on credit_allocations(installment_id);
create index credit_allocations_credit on credit_allocations(credit_id);
-- Future correction services must append signed, reasoned adjustments, never rewrite issued debt.
create table obligation_adjustments (
 id uuid primary key,installment_id uuid not null references installments(id),amount bigint not null check(amount<>0),
 reason text not null,actor_id uuid not null references accounts(id),effective_on date not null
);
create index obligation_adjustments_due on obligation_adjustments(installment_id);
create table treasury_movements (
 id uuid primary key,account_id uuid not null references treasury_accounts(id),kind text not null check(kind in ('OPENING_BALANCE','RECEIPT')),
 receipt_id uuid,amount bigint not null,effective_on date not null,reason text not null,actor_id uuid not null references accounts(id),
 foreign key(receipt_id,account_id) references receipts(id,account_id),
 check((kind='OPENING_BALANCE' and receipt_id is null) or (kind='RECEIPT' and receipt_id is not null and amount>0))
);
create unique index treasury_one_opening on treasury_movements(account_id) where kind='OPENING_BALANCE';
create unique index treasury_receipt_leg on treasury_movements(receipt_id) where kind='RECEIPT';
create index treasury_movement_account on treasury_movements(account_id,effective_on,id);
create table financial_audit_events (
 id uuid primary key,actor_id uuid not null references accounts(id),operation_id uuid not null,action text not null,details jsonb not null,created_at timestamptz not null default now(),
 foreign key(actor_id,operation_id) references financial_operations(actor_id,operation_id) deferrable initially deferred
);
-- Private immutable producer boundary; Phase 15 supplies finance-enabled recipient delivery.
create table financial_events (
 id uuid primary key,receipt_id uuid not null references receipts(id),child_id uuid not null references children(id),branch_id uuid not null references branches(id),
 kind text not null check(kind='RECEIPT_RECORDED'),created_at timestamptz not null default now(),unique(receipt_id,child_id)
);
create view installment_balances as
 select i.id,i.obligation_id,i.position,i.due_on,i.amount,
 coalesce((select sum(a.amount) from obligation_adjustments a where a.installment_id=i.id),0) as adjustments,
 coalesce((select sum(a.amount) from receipt_allocations a where a.installment_id=i.id),0) as allocated,
 coalesce((select sum(a.amount) from credit_allocations a where a.installment_id=i.id),0) as credited,
 i.amount::numeric+coalesce((select sum(a.amount) from obligation_adjustments a where a.installment_id=i.id),0)
 -coalesce((select sum(a.amount) from receipt_allocations a where a.installment_id=i.id),0)
 -coalesce((select sum(a.amount) from credit_allocations a where a.installment_id=i.id),0) as remaining
 from installments i;
create view obligation_balances as
 select o.id,o.child_id,o.branch_id,o.classroom_id,o.amount,
 (select sum(i.remaining) from installment_balances i where i.obligation_id=o.id) as remaining from obligations o;
create view treasury_balances as select a.id,coalesce(sum(m.amount),0) as balance from treasury_accounts a left join treasury_movements m on m.account_id=a.id group by a.id;
create view credit_balances as select c.id,c.amount::numeric-coalesce((select sum(a.amount) from credit_allocations a where a.credit_id=c.id),0) as remaining from credits c;
do $$ declare t text; begin
 foreach t in array array['financial_operations','treasury_accounts','fee_categories','obligations','installments','receipts','receipt_allocations','credits','credit_allocations','obligation_adjustments','treasury_movements','financial_audit_events','financial_events'] loop
 execute format('create trigger %I before update or delete on %I for each row execute function preserve_learning_history()',t||'_immutable',t);
 end loop;
end $$;
