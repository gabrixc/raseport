-- Report definitions (JSON, validated by the render service) and a demo dataset.

create table public.report_definitions (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  definition  jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.report_definitions enable row level security;

create policy "owners manage their report definitions"
  on public.report_definitions for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Demo data: replace with your own tables. Report RPCs must be named report_* and
-- return a deterministic order, because the render service pages through them.
create table public.sales (
  order_no    text primary key,
  region      text not null,
  ordered_on  date not null,
  amount      numeric(12, 2) not null,
  customer    jsonb not null
);

alter table public.sales enable row level security;
create policy "authenticated can read sales" on public.sales for select to authenticated using (true);

create function public.report_sales_by_region(p_month date)
returns table (order_no text, region text, ordered_on date, amount numeric, customer jsonb)
language sql stable security invoker
as $$
  select s.order_no, s.region, s.ordered_on, s.amount, s.customer
  from public.sales s
  where s.ordered_on >= date_trunc('month', p_month)::date
    and s.ordered_on <  (date_trunc('month', p_month) + interval '1 month')::date
  order by s.region, s.ordered_on, s.order_no
$$;
