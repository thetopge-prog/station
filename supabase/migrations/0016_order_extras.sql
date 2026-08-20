-- Order extras (إضافات): a positive surcharge for add-ons the customer requests
-- at the counter (extra shot, syrup, oat milk…), mirroring the existing discount.
-- Itemized description in extra_note; the amount flows into sales & profit.
alter table public.orders add column if not exists extra int not null default 0;
alter table public.orders add column if not exists extra_note text;

-- staff read the new columns (not cost-sensitive)
grant select (extra, extra_note) on public.orders to authenticated;

-- mark_order_paid gains p_extra / p_extra_note (drop the old 4-arg overload so
-- PostgREST has one signature).
drop function if exists public.mark_order_paid(uuid, int, uuid, int);
create or replace function public.mark_order_paid(
  p_order uuid, p_discount int default 0, p_customer uuid default null, p_award_points int default 0,
  p_extra int default 0, p_extra_note text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare v_seq int; v_cust uuid;
begin
  if not is_staff() then raise exception 'not authorized'; end if;
  update orders set
    status = 'paid', paid_at = now(),
    discount = greatest(0, coalesce(p_discount, 0)),
    extra = greatest(0, coalesce(p_extra, 0)),
    extra_note = nullif(trim(coalesce(p_extra_note, '')), ''),
    customer_id = coalesce(p_customer, customer_id)
    where id = p_order and status = 'pending'
    returning order_seq, customer_id into v_seq, v_cust;
  if not found then raise exception 'order not pending'; end if;
  if v_cust is not null and coalesce(p_award_points, 0) > 0 then
    insert into loyalty_events(customer_id, order_id, delta, reason)
      values (v_cust, p_order, p_award_points, 'earn_order')
      on conflict (order_id) where reason = 'earn_order' do nothing;
  end if;
  return v_seq;
end $$;
revoke execute on function public.mark_order_paid(uuid, int, uuid, int, int, text) from anon;

-- sales & profit now include the extra surcharge
create or replace function public.range_summary(p_from date, p_to date)
returns table(day date, sales bigint, orders_count bigint, profit bigint, expenses bigint, net bigint)
language sql security definer set search_path = public as $$
  with s as (
    select business_day d,
           sum(subtotal - discount + extra)::bigint sales,
           count(*)::bigint cnt,
           sum(subtotal - discount + extra - cost_total)::bigint profit
    from orders where status = 'paid' and business_day between p_from and p_to
    group by business_day
  ), e as (
    select business_day d, sum(amount)::bigint expenses
    from expenses where business_day between p_from and p_to
    group by business_day
  )
  select g::date,
         coalesce(s.sales, 0), coalesce(s.cnt, 0), coalesce(s.profit, 0),
         coalesce(e.expenses, 0), coalesce(s.profit, 0) - coalesce(e.expenses, 0)
  from generate_series(p_from, p_to, interval '1 day') g
  left join s on s.d = g::date
  left join e on e.d = g::date
  order by g;
$$;
revoke all on function public.range_summary(date, date) from public;
grant execute on function public.range_summary(date, date) to service_role;
