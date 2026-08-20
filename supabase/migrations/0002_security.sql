-- 0002_security.sql — RLS, helper fns, cost-free public views, column grants, RPC.
-- Core invariant: cost & profit NEVER traverse PostgREST. Cost columns are revoked
-- from anon+authenticated; cost/profit reach admin ONLY via the service-role client
-- (which bypasses RLS/grants). Cashier and admin share the `authenticated` role, so
-- RLS/grants cannot distinguish them — hence the service-role-only path for cost.
-- Idempotent: safe to re-run.

-- ── enable RLS everywhere ──────────────────────────────────────────────────
alter table public.roles            enable row level security;
alter table public.employees        enable row level security;
alter table public.categories       enable row level security;
alter table public.menu_items       enable row level security;
alter table public.item_variants    enable row level security;
alter table public.customers        enable row level security;
alter table public.order_counters   enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.expenses         enable row level security;
alter table public.loyalty_events   enable row level security;

-- ── role helpers (SECURITY DEFINER: bypass RLS, no recursion into policies) ─
create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from employees where auth_user_id = auth.uid() and is_active);
$$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from employees e join roles r on r.id = e.role_id
    where e.auth_user_id = auth.uid() and e.is_active and r.name_en = 'admin'
  );
$$;

-- ── column grants: hide cost from every PostgREST role ──────────────────────
revoke all on public.menu_items    from anon, authenticated;
revoke all on public.item_variants from anon, authenticated;
revoke all on public.orders        from anon, authenticated;
revoke all on public.order_items   from anon, authenticated;

grant select (id, category_id, name_ar, description_ar, image_url, price, flavors, is_active, sort, created_at)
  on public.menu_items to authenticated;               -- cost deliberately omitted
grant select (id, item_id, kind, name_ar, price_override, is_active, sort, created_at)
  on public.item_variants to authenticated;            -- cost_override omitted
grant select (id, business_day, order_seq, channel, status, subtotal, discount, table_no, note, customer_id, cashier_id, paid_at, created_at)
  on public.orders to authenticated;                   -- cost_total omitted
grant select (id, order_id, item_id, variant_id, name_ar, flavor_ar, qty, unit_price, line_total, created_at)
  on public.order_items to authenticated;              -- unit_cost omitted

grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.expenses to authenticated;  -- RLS restricts to admin
grant select on public.customers to authenticated;
grant select on public.loyalty_events to authenticated;
grant select on public.roles to authenticated;
grant select on public.employees to authenticated;

-- ── cost-free public views (anon reads the menu through these only) ─────────
drop view if exists public.menu_public;
create view public.menu_public as
  select mi.id, mi.category_id, mi.name_ar, mi.description_ar, mi.image_url,
         mi.price, mi.flavors, mi.sort,
         c.name_ar as category_name, c.image_url as category_image, c.sort as category_sort
  from public.menu_items mi
  join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active;
grant select on public.menu_public to anon, authenticated;

drop view if exists public.variant_public;
create view public.variant_public as
  select v.id, v.item_id, v.kind, v.name_ar,
         coalesce(v.price_override, mi.price) as price, v.sort
  from public.item_variants v
  join public.menu_items mi on mi.id = v.item_id
  where v.is_active and mi.is_active;
grant select on public.variant_public to anon, authenticated;

-- ── RLS policies ────────────────────────────────────────────────────────────
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select using (is_active);

drop policy if exists menu_items_auth_read on public.menu_items;
create policy menu_items_auth_read on public.menu_items for select to authenticated using (true);

drop policy if exists item_variants_auth_read on public.item_variants;
create policy item_variants_auth_read on public.item_variants for select to authenticated using (true);

drop policy if exists roles_auth_read on public.roles;
create policy roles_auth_read on public.roles for select to authenticated using (true);

drop policy if exists employees_self_read on public.employees;
create policy employees_self_read on public.employees for select to authenticated using (auth_user_id = auth.uid());

drop policy if exists orders_staff_read on public.orders;
create policy orders_staff_read on public.orders for select to authenticated using (public.is_staff());

drop policy if exists order_items_staff_read on public.order_items;
create policy order_items_staff_read on public.order_items for select to authenticated using (public.is_staff());

drop policy if exists expenses_admin_all on public.expenses;
create policy expenses_admin_all on public.expenses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists customers_staff_read on public.customers;
create policy customers_staff_read on public.customers for select to authenticated using (public.is_staff());

drop policy if exists loyalty_events_staff_read on public.loyalty_events;
create policy loyalty_events_staff_read on public.loyalty_events for select to authenticated using (public.is_staff());
-- order_counters: no policy → no direct anon/authenticated access (definer rpc only).

-- ── RPC: order placement (server computes every price from the menu) ────────
create or replace function public.place_order(
  p_channel public.order_channel,
  p_lines jsonb,
  p_customer uuid default null
) returns table(order_id uuid, order_seq int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_seq int;
  v_order uuid;
  v_cashier uuid;
  v_line jsonb;
  v_item public.menu_items;
  v_variant public.item_variants;
  v_qty int;
  v_price int;
  v_cost int;
  v_name text;
  v_flavor text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order';
  end if;

  select e.id into v_cashier from employees e
    where e.auth_user_id = auth.uid() and e.is_active limit 1;  -- null for anon self-orders

  insert into order_counters(business_day, last_seq) values (v_day, 1)
    on conflict (business_day) do update set last_seq = order_counters.last_seq + 1
    returning last_seq into v_seq;

  insert into orders(business_day, order_seq, channel, status, customer_id, cashier_id)
    values (v_day, v_seq, p_channel, 'pending', p_customer, v_cashier)
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
      v_flavor := null;  -- ignore an unknown flavor rather than fail the order
    end if;

    insert into order_items(order_id, item_id, variant_id, name_ar, flavor_ar, qty, unit_price, unit_cost)
      values (v_order, v_item.id, v_variant.id, v_name, v_flavor, v_qty, v_price, v_cost);
  end loop;

  update orders o set
    subtotal   = (select coalesce(sum(line_total), 0) from order_items where order_id = o.id),
    cost_total = (select coalesce(sum(qty * unit_cost), 0) from order_items where order_id = o.id)
    where o.id = v_order;

  return query select v_order, v_seq;
end $$;

-- ── RPC: payment (paid transition + idempotent points earn) ─────────────────
create or replace function public.mark_order_paid(
  p_order uuid, p_discount int default 0, p_customer uuid default null, p_award_points int default 0
) returns int
language plpgsql security definer set search_path = public as $$
declare v_seq int; v_cust uuid;
begin
  if not is_staff() then raise exception 'not authorized'; end if;
  update orders set
    status = 'paid', paid_at = now(),
    discount = greatest(0, coalesce(p_discount, 0)),
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

create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not authorized'; end if;
  update orders set status = 'cancelled' where id = p_order and status = 'pending';
  if not found then raise exception 'order not cancellable'; end if;
end $$;

create or replace function public.refund_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  update orders set status = 'refunded' where id = p_order and status = 'paid';
  if not found then raise exception 'order not refundable'; end if;
end $$;

-- ── RPC: loyalty ────────────────────────────────────────────────────────────
create or replace function public.get_card(p_serial text)
returns table(id uuid, name_ar text, points int)
language sql security definer set search_path = public as $$
  select id, name_ar, points from customers where card_serial = p_serial;
$$;

create or replace function public.create_card(p_phone text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_serial text;
begin
  if p_phone is not null and length(trim(p_phone)) > 0 then
    select card_serial into v_serial from customers where phone = trim(p_phone);
    if found then return v_serial; end if;
  end if;
  insert into customers(phone, name_ar)
    values (nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_name, '')), ''))
    returning card_serial into v_serial;
  return v_serial;
end $$;

create or replace function public.adjust_points(p_customer uuid, p_delta int, p_reason text, p_key text default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not authorized'; end if;
  insert into loyalty_events(customer_id, delta, reason, idempotency_key)
    values (p_customer, p_delta, coalesce(p_reason, 'manual_adjust'), p_key)
    on conflict (idempotency_key) do nothing;
  return (select points from customers where id = p_customer);
end $$;

create or replace function public.redeem_points(p_customer uuid, p_cost int, p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare bal int;
begin
  if not is_staff() then raise exception 'not authorized'; end if;
  if coalesce(p_cost, 0) <= 0 then raise exception 'invalid redeem amount'; end if;
  select points into bal from customers where id = p_customer for update;  -- lock the row
  if bal is null then raise exception 'customer not found'; end if;
  if bal < p_cost then raise exception 'insufficient points'; end if;
  insert into loyalty_events(customer_id, delta, reason, idempotency_key)
    values (p_customer, -p_cost, 'redeem_reward', p_key)
    on conflict (idempotency_key) do nothing;
  return (select points from customers where id = p_customer);
end $$;

-- ── RPC: daily sales rollup (exposes profit → service-role only) ────────────
create or replace function public.range_summary(p_from date, p_to date)
returns table(day date, sales bigint, orders_count bigint, profit bigint, expenses bigint, net bigint)
language sql security definer set search_path = public as $$
  with s as (
    select business_day d,
           sum(subtotal - discount)::bigint sales,
           count(*)::bigint cnt,
           sum(subtotal - discount - cost_total)::bigint profit
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

-- ── function execute grants ─────────────────────────────────────────────────
-- Staff-only rpc: keep from anon (internal is_staff() guard is the real gate).
revoke execute on function public.mark_order_paid(uuid, int, uuid, int) from anon;
revoke execute on function public.cancel_order(uuid) from anon;
revoke execute on function public.refund_order(uuid) from anon;
revoke execute on function public.adjust_points(uuid, int, text, text) from anon;
revoke execute on function public.redeem_points(uuid, int, text) from anon;
-- Profit-exposing rollup: service-role only.
revoke all on function public.range_summary(date, date) from public;
grant execute on function public.range_summary(date, date) to service_role;
-- place_order / get_card / create_card keep the default (anon may self-order & self-register).
