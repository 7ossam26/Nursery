-- One initial notice per overdue installment/recipient; explicit resend uses a new actor operation.
create table finance_reminders (
 id uuid primary key,installment_id uuid not null references installments(id),recipient_id uuid not null references accounts(id),
 child_id uuid not null references children(id),delivery_key text not null,business_date date not null,
 actor_id uuid references accounts(id),created_at timestamptz not null default now(),unique(installment_id,recipient_id,delivery_key)
);
create index finance_reminder_recipient on finance_reminders(recipient_id,installment_id);
create trigger finance_reminders_immutable before update or delete on finance_reminders for each row execute function preserve_learning_history();
alter view parent_notification_sources rename to parent_notification_base_sources;
create view parent_notification_sources as
 select * from parent_notification_base_sources
 union all select 'finance:'||n.id::text,n.child_id,'OVERDUE','FINANCE',n.business_date,array[n.recipient_id],null::uuid
 from finance_reminders n join accounts a on a.id=n.recipient_id where a.kind='GUARDIAN'
 union all select 'receipt:'||e.receipt_id::text,e.child_id,'RECEIPT','FINANCE',r.collected_on,
 array(select l.guardian_id from guardian_child_links l where l.child_id=e.child_id and l.active and l.can_read and l.can_finance and l.can_notify),null::uuid
 from financial_events e join receipts r on r.id=e.receipt_id;
