-- Lists the report_* functions a user can use as data sources, so the designer can offer a picker
-- (with the arguments each one needs) instead of asking people to type function names.
-- Describe a source with: comment on function report_x(...) is 'Friendly name shown in the designer';

create function public.report_catalog()
returns table (name text, arguments text, description text)
language sql stable security invoker
set search_path = public, pg_catalog
as $$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         obj_description(p.oid, 'pg_proc')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname ~ '^report_[a-z0-9_]+$'
    and p.proname <> 'report_catalog'
  order by p.proname
$$;

comment on function public.report_sales_by_region(date) is 'Sales by region for a month';
