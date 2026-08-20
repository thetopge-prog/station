-- 0028_queue_display.sql — the waiting-area TV feed and the repo's first realtime.
--
-- MONEY-FREE BY CONSTRUCTION. This view is projected onto a screen the public
-- can read, so it exposes no subtotal, no discount, no cost — only what the
-- spec asks for: order number, security code, cashier name, expediter name.

create or replace view public.queue_public as
  select
    o.id,
    o.order_seq,
    o.pickup_code,
    o.prep_status,
    o.table_no,
    o.channel,
    o.created_at,
    c.name_ar as cashier_name,
    e.name_ar as expediter_name
  from public.orders o
  left join public.employees c on c.id = o.cashier_id
  left join public.employees e on e.id = o.expediter_id
  where o.business_day = (now() at time zone 'Asia/Baghdad')::date
    and o.prep_status in ('preparing', 'ready')
    and o.status <> 'cancelled'
  order by case o.prep_status when 'ready' then 0 else 1 end, o.created_at;

grant select on public.queue_public to authenticated;

-- First realtime publication in this project — the TV and the KDS subscribe to
-- orders instead of polling. Guarded because add-table errors if already there.
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
