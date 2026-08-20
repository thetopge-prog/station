-- 0044_hub_sync.sql — the door the Station Hub pushes through when the line comes back.
--
-- Context: 0025 added `source`, `updated_at` and the sequence split (the shop
-- takes 1..899, web delivery/pickup take 900+) precisely so a hub order and a
-- cloud order can never collide on unique(business_day, order_seq). This
-- migration adds the two functions that actually use it.
--
-- Why not just call place_order on replay? Because place_order allocates a
-- FRESH order number, and the customer is holding a printed receipt with the
-- number the hub gave them twenty minutes ago. Replay must preserve the id,
-- the number, the pickup code and the original timestamp — otherwise the
-- kitchen ticket, the receipt and the report all disagree.
--
-- Exactly-once: the hub mints the order uuid locally, so the primary key IS
-- the idempotency key. Replaying the same order ten times inserts it once.
-- That matters more than it sounds — a flapping connection retries constantly,
-- and a double-inserted order is a double-counted sale.

-- Prices and costs are recomputed here from menu_items rather than trusted from
-- the payload. The hub is a till in a shop, not a source of truth about money:
-- if its cached menu is stale, the cloud figure wins and the books stay right.
create or replace function public.sync_hub_order(
  p_id uuid,
  p_seq int,
  p_day date,
  p_channel public.order_channel,
  p_lines jsonb,
  p_created timestamptz,
  p_table text default null,
  p_note text default null,
  p_phone text default null,
  p_address text default null,
  p_customer_name text default null,
  p_code text default null,
  p_cashier uuid default null,
  p_expediter uuid default null,
  p_prep_status text default 'new'
) returns table(order_id uuid, order_seq int, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_line jsonb;
  v_item public.menu_items;
  v_variant public.item_variants;
  v_qty int;
  v_price int;
  v_cost int;
  v_name text;
  v_flavor text;
  v_seq int := p_seq;
  v_inserted uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order';
  end if;

  -- Already here? Say so and touch nothing. The hub can then tick it off.
  if exists (select 1 from orders o where o.id = p_id) then
    select o.order_seq into v_seq from orders o where o.id = p_id;
    return query select p_id, v_seq, true;
    return;
  end if;

  -- The number band should make this impossible, but a shop that ran two hubs
  -- for an hour would find out the hard way. Take the next free shop number
  -- instead of losing the sale; the hub records the change.
  if exists (select 1 from orders o where o.business_day = p_day and o.order_seq = v_seq) then
    insert into order_counters(business_day, last_seq) values (p_day, 1)
      on conflict (business_day) do update set last_seq = order_counters.last_seq + 1
      returning last_seq into v_seq;
  end if;

  insert into orders(id, business_day, order_seq, channel, status, prep_status,
                     cashier_id, expediter_id, table_no, note, pickup_code,
                     customer_phone, address_note, order_source, customer_name,
                     source, created_at)
    values (p_id, p_day, v_seq, p_channel, 'pending',
            (case when p_prep_status in ('new','preparing','ready','handed') then p_prep_status else 'new' end)::public.prep_status,
            p_cashier, p_expediter,
            nullif(trim(coalesce(p_table, '')), ''),
            nullif(left(trim(coalesce(p_note, '')), 300), ''),
            nullif(trim(coalesce(p_code, '')), ''),
            nullif(left(trim(coalesce(p_phone, '')), 20), ''),
            nullif(left(trim(coalesce(p_address, '')), 300), ''),
            'pos',
            nullif(left(trim(coalesce(p_customer_name, '')), 120), ''),
            'hub', p_created)
    returning id into v_inserted;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant := null;
    v_qty := greatest(1, coalesce((v_line->>'qty')::int, 1));

    select * into v_item from menu_items where id = (v_line->>'item_id')::uuid;
    -- An item deactivated while the hub was offline must not lose the sale that
    -- already happened: skip the price lookup, not the line.
    if not found then continue; end if;

    if nullif(v_line->>'variant_id', '') is not null then
      select * into v_variant from item_variants
        where id = (v_line->>'variant_id')::uuid and item_id = v_item.id;
    end if;

    -- same expressions place_order uses, so a replayed order and a live one
    -- price identically; a divergence here is a books discrepancy nobody finds
    v_price := coalesce(v_variant.price_override, v_item.price);
    v_cost  := coalesce(v_variant.cost_override, v_item.cost);
    v_name  := v_item.name_ar || case when v_variant.id is not null then ' - ' || v_variant.name_ar else '' end;
    v_flavor := nullif(v_line->>'flavor', '');
    if v_flavor is not null and not (v_flavor = any(v_item.flavors)) then
      v_flavor := null;
    end if;

    insert into order_items(order_id, item_id, variant_id, name_ar, flavor_ar,
                            qty, unit_price, unit_cost, source)
      values (p_id, v_item.id, v_variant.id, v_name, v_flavor,
              v_qty, v_price, v_cost, 'hub');
  end loop;

  -- aliased on purpose: this function RETURNS TABLE(order_id ...), so a bare
  -- `order_id` in here is ambiguous between that out-parameter and the column
  update orders o set
    subtotal   = (select coalesce(sum(oi.line_total), 0) from order_items oi where oi.order_id = o.id),
    cost_total = (select coalesce(sum(oi.qty * oi.unit_cost), 0) from order_items oi where oi.order_id = o.id)
    where o.id = p_id;

  -- Keep the cloud counter ahead of anything the hub already handed out, so the
  -- next order taken online does not reuse a number sitting on a receipt.
  insert into order_counters(business_day, last_seq) values (p_day, v_seq)
    on conflict (business_day) do update
      set last_seq = greatest(order_counters.last_seq, excluded.last_seq);

  return query select v_inserted, v_seq, false;
end $$;

-- Prep transitions that happened offline. Last-writer-wins on the timestamp,
-- which 0025 already established is safe here: one order is assembled by one
-- shop at one moment, so the only competing writer is a staff member who
-- touched the same order from a phone on mobile data.
create or replace function public.sync_hub_prep(
  p_id uuid,
  p_status text,
  p_at timestamptz
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_applied boolean := false;
begin
  update orders o
     set prep_status = p_status::public.prep_status
   where o.id = p_id
     and p_status in ('new','preparing','ready','handed')
     and o.updated_at <= p_at
   returning true into v_applied;
  return coalesce(v_applied, false);
end $$;

-- Service role only. These functions write orders with an id and a number of
-- the caller's choosing — that is a trust the hub earns by running inside the
-- shop with the service key, and nobody else gets it.
revoke all on function public.sync_hub_order(uuid, int, date, public.order_channel, jsonb, timestamptz, text, text, text, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sync_hub_prep(uuid, text, timestamptz) from public, anon, authenticated;
