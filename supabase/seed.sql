-- 2000 demo orders in January 2026
insert into public.sales (order_no, region, ordered_on, amount, customer)
select
  'ORD-' || lpad(i::text, 5, '0'),
  (array['North','South','East','West'])[1 + i % 4],
  date '2026-01-01' + (i % 31),
  round((50 + (i * 37 % 4950))::numeric + (i % 100) / 100.0, 2),
  jsonb_build_object('name', 'Customer ' || (i % 120), 'tier', (array['basic','silver','gold'])[1 + i % 3])
from generate_series(1, 2000) as i;
