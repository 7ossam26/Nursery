create table billing_agreements (
 id uuid primary key, actor_id uuid not null references accounts(id), status text not null check(status in ('DRAFT','APPROVED')),
 version integer not null default 1 check(version>0), terms jsonb not null, allocations jsonb not null, first_allocations jsonb, next_period date, ended_on date
);
create table billing_children (
 agreement_id uuid not null references billing_agreements(id),child_id uuid not null references children(id),primary key(agreement_id,child_id)
);
create table agreement_versions (
 id uuid primary key,agreement_id uuid not null references billing_agreements(id),effective_from date not null,
 normal_amount bigint not null check(normal_amount>=0),agreed_amount bigint not null check(agreed_amount>=0 and agreed_amount<=normal_amount),
 allocations jsonb not null,reason text not null,actor_id uuid not null references accounts(id),unique(agreement_id,effective_from)
);
create table billing_pauses (
 id uuid primary key,agreement_id uuid not null references billing_agreements(id),from_period date not null,until_period date not null,
 reason text not null,actor_id uuid not null references accounts(id),check(until_period>=from_period)
);
create table billing_periods (
 agreement_id uuid not null references billing_agreements(id),period date not null,state text not null check(state in ('GENERATED','SKIPPED','DISABLED')),
 primary key(agreement_id,period)
);
create table recurrence_occurrences (
 agreement_id uuid not null references billing_agreements(id),child_id uuid not null references children(id),service_period_start date not null,
 category_id uuid not null references fee_categories(id),obligation_id uuid not null unique references obligations(id),
 primary key(agreement_id,child_id,service_period_start,category_id)
);
create table billing_catchup_approvals (
 id uuid primary key,agreement_id uuid not null references billing_agreements(id),actor_id uuid not null references accounts(id),preview_hash text not null,periods jsonb not null
);
create index billing_pending on billing_periods(agreement_id,period) where state='DISABLED';
create index billing_next on billing_agreements(next_period,id) where status='APPROVED';
do $$ declare t text; begin
 foreach t in array array['billing_children','agreement_versions','billing_pauses','recurrence_occurrences','billing_catchup_approvals'] loop
 execute format('create trigger %I before update or delete on %I for each row execute function preserve_learning_history()',t||'_immutable',t);
 end loop;
end $$;
create function preserve_billing_terms() returns trigger language plpgsql as $$ begin
 if tg_op='DELETE' then raise exception 'Billing agreements cannot be deleted'; end if;
 if new.terms<>old.terms or new.allocations<>old.allocations or new.first_allocations is distinct from old.first_allocations or (old.status='APPROVED' and (new.status<>old.status or new.actor_id<>old.actor_id)) then
 raise exception 'Approved terms and stored allocations are immutable'; end if;
 return new;
end $$;
create trigger billing_terms_immutable before update or delete on billing_agreements for each row execute function preserve_billing_terms();
