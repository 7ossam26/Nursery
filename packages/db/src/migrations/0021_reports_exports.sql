-- Phase 20: durable, private, expiring report exports. Files are written outside the web root.
create table report_exports (
 id uuid primary key,creator_id uuid not null references accounts(id),kind text not null,format text not null check(format in ('PDF','XLSX')),
 filters jsonb not null,scope jsonb not null,resources jsonb not null default '[]',operation_id uuid not null,request_hash text not null,status text not null check(status in ('PENDING','READY','FAILED','EXPIRED')),
 storage_key uuid unique,mime_type text,byte_size integer,sha256 text,row_count integer,error_code text,
 created_at timestamptz not null default now(),expires_at timestamptz not null,completed_at timestamptz,attempts integer not null default 0 check(attempts between 0 and 3),next_attempt_at timestamptz not null default now(),unique(creator_id,operation_id),
 check((status='READY' and storage_key is not null and mime_type is not null and byte_size>0 and sha256 is not null and row_count>=0 and completed_at is not null)
    or (status in ('PENDING','FAILED','EXPIRED') and storage_key is null and mime_type is null and byte_size is null and sha256 is null and row_count is null))
);
create index report_exports_creator_status on report_exports(creator_id,status,created_at desc);
create index report_exports_expiry on report_exports(status,expires_at);
create index report_exports_pending on report_exports(next_attempt_at,created_at,id) where status='PENDING';
create index treasury_report_date on treasury_movements(effective_on,account_id,id);
create index report_documents_expiry on child_documents(expires_on,child_id) where not retired;
create index report_refunds_date on refunds(funding_branch_id,refunded_on,id);

-- Every signed cash row comes from an immutable treasury leg. Receipt snapshots are split
-- into child lines so classroom aggregates never expose another classroom's receipt share.
create view report_cash_rows as
 select m.id::text||'/'||line.ordinality::text as id,m.effective_on as date,r.branch_id,
 nullif(line.value->>'classroomId','')::uuid as classroom_id,nullif(line.value->>'childId','')::uuid as child_id,
 r.reference as label,case when m.amount<0 then 'COLLECTION_REVERSAL' else 'COLLECTION' end as category,
 o.category_id,case when m.amount<0 then -1 else 1 end*(line.value->>'amount')::numeric as amount,
 jsonb_build_object('child',line.value->>'childName','childCode',line.value->>'childCode','category',line.value->>'categoryName','categoryKind',o.category_kind,'account',r.account_code) as details
 from treasury_movements m join receipts r on r.id=coalesce(m.receipt_id,m.source_receipt_id)
 cross join lateral jsonb_array_elements(r.lines) with ordinality line(value,ordinality)
 left join installments i on i.id=nullif(line.value->>'installmentId','')::uuid left join obligations o on o.id=i.obligation_id
 where m.kind='RECEIPT' or m.correction_leg='RECEIPT_REVERSAL'
 union all
 select m.id::text,m.effective_on,a.branch_id,coalesce(e.classroom_id,nullif(refund_line.value->>'classroomId','')::uuid),nullif(refund_line.value->>'childId','')::uuid,
 coalesce(e.note,p.employee_name,m.reason),
 case when m.kind='REFUND' then 'REFUND' when m.kind in ('PAYROLL_ADVANCE','PAYROLL_SETTLEMENT') then m.kind
 when m.kind='EXPENSE' or m.correction_leg in ('EXPENSE_REVERSAL','EXPENSE_REPLACEMENT') then 'OPERATING_EXPENSE'
 when m.kind='TRANSFER' or m.correction_leg like 'TRANSFER_%' then 'INTERNAL_TRANSFER' else m.kind end,
 e.category_id,m.amount::numeric,
 jsonb_build_object('account',a.code,'reason',m.reason,'category',e.category_name,'employeeCode',p.employee_code,'child',refund_line.value->>'childName','childCode',refund_line.value->>'childCode')
 from treasury_movements m join treasury_accounts a on a.id=m.account_id
 left join refunds refund on refund.id=m.refund_id
 left join credits credit on credit.id=refund.credit_id
 left join receipts original on original.id=refund.original_receipt_id
 left join lateral (select value from jsonb_array_elements(original.lines) where value->>'childId'=credit.child_id::text limit 1) refund_line on true
 left join expense_corrections ec on ec.correction_id=m.correction_id
 left join expense_settlements es on es.id=coalesce(m.expense_settlement_id,ec.original_settlement_id)
 left join expenses e on e.id=es.expense_id
 left join payroll_cash_sources ps on ps.id=coalesce(m.payroll_advance_id,m.payroll_settlement_id)
 left join payroll_periods p on p.id=ps.period_id
 where m.kind<>'RECEIPT' and m.correction_leg is distinct from 'RECEIPT_REVERSAL';
