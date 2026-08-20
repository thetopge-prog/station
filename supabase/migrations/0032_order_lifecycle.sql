-- 0032_order_lifecycle.sql — the operational workflow, corrected.
--
-- TWO FIXES against the operating spec:
--
-- 1. «تحت التحضير فور الطلب». 0028 showed only prep_status in ('preparing',
--    'ready'), but place_order creates orders as 'new' — so a freshly placed
--    order appeared on NO screen until somebody claimed it. The customer display
--    must show it the moment it is taken. 'new' and 'preparing' are now one
--    DISPLAY bucket while staying distinct internally (the KDS still needs to
--    know whether a chef has actually started).
--
-- 2. «اسم المجهّز على تذكرة التجهيز». The assembly ticket prints at payment,
--    before anyone claims the order, so the expediter name has to come from the
--    open shift (0031) at insert time rather than from a later claim.

-- ── 1. display bucket ────────────────────────────────────────────────────
-- DROP, not CREATE OR REPLACE: prep_status changes from the enum to text here
-- (two internal states collapse into one display bucket), and Postgres refuses
-- to change a view column type in place.
drop view if exists public.queue_public;
create view public.queue_public as
  select
    o.id,
    o.order_seq,
    o.pickup_code,
    -- what the TV shows: two columns, never three
    (case when o.prep_status = 'ready' then 'ready' else 'preparing' end)::text as prep_status,
    o.table_no,
    o.channel,
    o.created_at,
    o.eta_minutes,
    c.name_ar as cashier_name,
    e.name_ar as expediter_name
  from public.orders o
  left join public.employees c on c.id = o.cashier_id
  left join public.employees e on e.id = o.expediter_id
  where o.business_day = (now() at time zone 'Asia/Baghdad')::date
    and o.prep_status in ('new', 'preparing', 'ready')
    and o.status <> 'cancelled'
  order by case when o.prep_status = 'ready' then 0 else 1 end, o.created_at;

grant select on public.queue_public to authenticated;

-- ── 2. who is on the expediter station right now ─────────────────────────
create or replace function public.current_expediter(p_station uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select s.employee_id
  from public.shifts s
  where s.closed_at is null
    and s.role = 'expediter'
    and s.business_day = (now() at time zone 'Asia/Baghdad')::date
    and (p_station is null or s.station_id is not distinct from p_station)
  order by s.opened_at desc
  limit 1;
$$;

-- ── 3. place_order v3: stamp the shift expediter, source and customer ────
drop function if exists public.place_order(public.order_channel, jsonb, uuid, text, text, text, text);

create or replace function public.place_order(
  p_channel public.order_channel,
  p_lines jsonb,
  p_customer uuid default null,
  p_table text default null,
  p_note text default null,
  p_phone text default null,
  p_address text default null,
  p_source text default 'pos',
  p_customer_name text default null
) returns table(order_id uuid, order_seq int, pickup_code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_seq int;
  v_order uuid;
  v_cashier uuid;
  v_expediter uuid;
  v_line jsonb;
  v_item public.menu_items;
  v_variant public.item_variants;
  v_qty int;
  v_price int;
  v_cost int;
  v_name text;
  v_flavor text;
  v_code text;
  v_remote boolean := p_channel in ('delivery', 'pickup');
  v_try int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order';
  end if;

  select e.id into v_cashier from employees e
    where e.auth_user_id = auth.uid() and e.is_active limit 1;  -- null for anon self-orders

  -- accountability: the ticket names whoever is ON the expediter station now
  v_expediter := public.current_expediter();

  if v_remote then
    insert into order_counters_remote(business_day, last_seq) values (v_day, 901)
      on conflict (business_day) do update set last_seq = order_counters_remote.last_seq + 1
      returning last_seq into v_seq;
  else
    insert into order_counters(business_day, last_seq) values (v_day, 1)
      on conflict (business_day) do update set last_seq = order_counters.last_seq + 1
      returning last_seq into v_seq;
  end if;

  loop
    v_try := v_try + 1;
    v_code := lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
    exit when not exists (
      select 1 from orders o where o.business_day = v_day and o.pickup_code = v_code
    );
    if v_try > 20 then
      v_code := null;   -- never block a sale over a display code
      exit;
    end if;
  end loop;

  insert into orders(business_day, order_seq, channel, status, prep_status, customer_id, cashier_id,
                     expediter_id, table_no, note, pickup_code, customer_phone, address_note,
                     order_source, customer_name, source)
    values (v_day, v_seq, p_channel, 'pending', 'new', p_customer, v_cashier,
            v_expediter,
            nullif(trim(coalesce(p_table, '')), ''),
            nullif(left(trim(coalesce(p_note, '')), 300), ''),
            v_code,
            nullif(left(trim(coalesce(p_phone, '')), 20), ''),
            nullif(left(trim(coalesce(p_address, '')), 300), ''),
            case when p_source in ('pos', 'web', 'whatsapp') then p_source else 'pos' end,
            nullif(left(trim(coalesce(p_customer_name, '')), 120), ''),
            'cloud')
    returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant := null;
    v_qty := greatest(1, coalesce((v_line->>'qty')::int, 1));

    select * into v_item from menu_items where id = (v_line->>'item_id')::uuid and is_active;
    if not found then raise exception 'item not available: %', v_line->>'item_id'; end if;

    if nullif(v_line->>'variant_id', '') is not null then
      select * into v_variant from item_variants
        where id = (v_line->>'variant_id')::uuid and item_id = v_item.id and is_active;
      if not found then raise exception 'variant not available'; end if;
    end if;

    v_price := coalesce(v_variant.price_override, v_item.price);
    v_cost  := coalesce(v_variant.cost_override, v_item.cost);
    v_name  := v_item.name_ar || case when v_variant.id is not null then ' - ' || v_variant.name_ar else '' end;
    v_flavor := nullif(v_line->>'flavor', '');
    if v_flavor is not null and not (v_flavor = any(v_item.flavors)) then
      v_flavor := null;
    end if;

    insert into order_items(order_id, item_id, variant_id, name_ar, flavor_ar, qty, unit_price, unit_cost)
      values (v_order, v_item.id, v_variant.id, v_name, v_flavor, v_qty, v_price, v_cost);
  end loop;

  update orders o set
    subtotal   = (select coalesce(sum(line_total), 0) from order_items where order_id = o.id),
    cost_total = (select coalesce(sum(qty * unit_cost), 0) from order_items where order_id = o.id)
    where o.id = v_order;

  return query select v_order, v_seq, v_code;
end $$;

-- ── 4. «إعادة استلام / تأكيد» — the expediter confirmation ───────────────
-- Replaces mark_ready with a version that ALSO records who confirmed, because
-- the confirmation is the accountability event, not just a status flip.
create or replace function public.confirm_assembled(p_order uuid)
returns table(order_seq int, pickup_code text, expediter_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  -- fall back to whoever holds the shift: a shared expediter tablet is signed
  -- in as one account, and the shift is the more accurate record of the person
  v_emp := coalesce(v_emp, public.current_expediter());

  update orders o
     set prep_status  = 'ready',
         expediter_id = coalesce(o.expediter_id, v_emp)
   where o.id = p_order;

  return query
    select o.order_seq, o.pickup_code, e.name_ar
    from orders o left join employees e on e.id = o.expediter_id
    where o.id = p_order;
end $$;

revoke execute on function public.confirm_assembled(uuid) from anon;
revoke execute on function public.current_expediter(uuid) from anon;
