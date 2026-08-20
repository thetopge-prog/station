-- 0035_fulfilment.sql — automatic table assignment + the curbside notify stamp.
--
-- place_order v4 adds ONE behaviour: p_table = '#auto' means "give this party
-- the first free table". Everything else is byte-identical to v3 (0032).
--
-- Why in the RPC and not in a server action: two customers tapping «أكل في
-- المطعم» at the same moment must not be handed the same table. Assigning
-- inside the same transaction that inserts the order, under an advisory lock,
-- makes that impossible. Doing it in TypeScript before the insert leaves a
-- window — small, but it is the window where two families end up at table 7.

-- ── notify stamp: greys out «أبلِغ الزبون» so nobody is messaged twice ─────
alter table public.orders
  add column if not exists notified_at timestamptz;
grant select (notified_at) on public.orders to authenticated;

create or replace function public.mark_notified(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  update orders set notified_at = now() where id = p_order and notified_at is null;
end $$;
revoke execute on function public.mark_notified(uuid) from anon;

-- ── which tables are taken right now ──────────────────────────────────────
-- Mirrors deriveTableStatuses() in src/lib/cafe/tables.ts: a table is busy if it
-- carries an unpaid order, or was paid within the last 30 minutes (the party is
-- still sitting there). Kept as its own function so the rule lives in one place.
create or replace function public.busy_tables()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct o.table_no
  from public.orders o
  where o.table_no is not null
    and o.business_day = (now() at time zone 'Asia/Baghdad')::date
    and (
      o.status = 'pending'
      or (o.status = 'paid' and o.paid_at is not null and o.paid_at > now() - interval '30 minutes')
    );
$$;

-- ── place_order v4 ────────────────────────────────────────────────────────
drop function if exists public.place_order(public.order_channel, jsonb, uuid, text, text, text, text, text, text);

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
) returns table(order_id uuid, order_seq int, pickup_code text, table_no text)
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
  v_table text;
  v_remote boolean := p_channel in ('delivery', 'pickup', 'curbside');
  v_try int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order';
  end if;

  select e.id into v_cashier from employees e
    where e.auth_user_id = auth.uid() and e.is_active limit 1;  -- null for anon self-orders

  v_expediter := public.current_expediter();

  -- ── automatic table assignment ──────────────────────────────────────────
  v_table := nullif(trim(coalesce(p_table, '')), '');
  if v_table = '#auto' then
    -- serialise every concurrent claim; released when this transaction ends
    perform pg_advisory_xact_lock(hashtext('station_table_claim'));
    select t.name into v_table
      from cafe_tables t
     where t.active
       and t.name not in (select public.busy_tables())
     order by t.sort, t.name
     limit 1;
    -- a full house must not lose the sale: the order still goes through with no
    -- table and the staff seat them by hand
    if v_table is null then
      p_note := trim(both ' ·' from coalesce(p_note, '') || ' · ⚠ لا توجد طاولة فارغة');
    end if;
  end if;

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
            v_table,
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

  return query select v_order, v_seq, v_code, v_table;
end $$;
