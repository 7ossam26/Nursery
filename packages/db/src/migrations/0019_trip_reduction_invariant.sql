-- Preserve the established deferred validator verbatim; alter only its fixed
-- reduction-category predicate, and make target kinds explicit infrastructure.
alter table financial_corrections drop constraint financial_corrections_target_kind_check;
alter table financial_corrections add constraint financial_corrections_target_kind_check check(target_kind in ('RECEIPT','EXPENSE','TRANSFER','TUITION','TRIP'));
do $$ declare definition text; begin
 select pg_get_functiondef('validate_financial_correction()'::regprocedure) into definition;
 definition:=replace(definition,'o.category_kind=''TUITION''','c.target_kind in (''TUITION'',''TRIP'') and o.category_kind=c.target_kind');
 execute definition;
end $$;
