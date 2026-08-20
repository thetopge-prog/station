-- 0045_delivery_partners.sql — طلبات شركات التوصيل بالآجل
--
-- Talabat, Toters, Zad and whoever comes next do not pay at the counter. They
-- take the order, hand over the food, and settle by bank transfer once a week.
-- Three consequences, and the money only stays right if all three hold:
--
--   1. The sale IS revenue the moment it happens (the food left the kitchen).
--   2. The cash did NOT enter the drawer, so it must never appear in the
--      cashier's expected float — a shift that "expects" money nobody handed
--      over reads as a shortage, and an honest cashier gets accused.
--   3. What is owed has to be tracked per company until the transfer lands.
--
-- Point 2 is handled without a single new line in session_report: that function
-- computes cash_sales as `filter (where payment_method = 'cash')`, so adding
-- 'partner' as a third payment method excludes these orders by construction
-- rather than by a rule someone has to remember. That is the whole design.

create table if not exists public.delivery_partners (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  phone text,
  -- disabled, never deleted: a partner with a year of orders behind them must
  -- keep resolving on old receipts and in old reports
  is_active boolean not null default true,
  sort int not null default 0,
  note text,
  created_at timestamptz not null default now()
);
alter table public.delivery_partners enable row level security;
revoke all on public.delivery_partners from anon, authenticated;

-- Staff need to READ the list to tag an order; only the admin RPCs below write.
grant select on public.delivery_partners to authenticated;
drop policy if exists delivery_partners_read on public.delivery_partners;
create policy delivery_partners_read on public.delivery_partners
  for select to authenticated using (public.is_staff());

alter table public.orders
  add column if not exists partner_id uuid references public.delivery_partners(id) on delete restrict;
create index if not exists orders_partner_idx on public.orders(partner_id) where partner_id is not null;
grant select (partner_id) on public.orders to authenticated;

-- 'partner' = billed to a delivery company, collected later. Third value only;
-- the two existing ones keep their exact meaning.
alter table public.orders drop constraint if exists orders_payment_method_chk;
alter table public.orders add constraint orders_payment_method_chk
  check (payment_method is null or payment_method in ('cash', 'card', 'partner'));

-- Money actually received from a company: a weekly transfer, a cash drop, a
-- credit note. Recorded in bulk, not per order — which is how they pay.
create table if not exists public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.delivery_partners(id) on delete restrict,
  amount int not null check (amount > 0),
  method text not null default 'transfer' check (method in ('cash', 'transfer', 'other')),
  note text,
  created_by uuid references public.employees(id) on delete set null,
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  created_at timestamptz not null default now()
);
alter table public.partner_settlements enable row level security;
revoke all on public.partner_settlements from anon, authenticated;
create index if not exists partner_settlements_partner_idx on public.partner_settlements(partner_id, created_at desc);

/**
 * What each company owes right now.
 *
 * Billed counts every non-cancelled order tagged to them, settled counts every
 * payment received, and the difference is the receivable. No status column on
 * the order says "settled": payments arrive in bulk against a running balance,
 * so trying to mark individual orders paid would be inventing a reconciliation
 * the company never actually sends.
 */
create or replace view public.partner_balances as
select
  p.id,
  p.name_ar,
  p.is_active,
  p.phone,
  coalesce(o.billed, 0)::int    as billed,
  coalesce(s.settled, 0)::int   as settled,
  (coalesce(o.billed, 0) - coalesce(s.settled, 0))::int as balance,
  coalesce(o.orders_count, 0)::int as orders_count,
  o.last_order_at,
  s.last_settled_at
from public.delivery_partners p
left join (
  select partner_id,
         sum(subtotal - discount + extra) as billed,
         count(*)                         as orders_count,
         max(created_at)                  as last_order_at
    from public.orders
   where partner_id is not null and status <> 'cancelled'
   group by partner_id
) o on o.partner_id = p.id
left join (
  select partner_id, sum(amount) as settled, max(created_at) as last_settled_at
    from public.partner_settlements
   group by partner_id
) s on s.partner_id = p.id;

-- The ledger carries order totals. Money is management's business, not the
-- anon menu's and not a chef's tablet — read it through the RPCs below.
revoke all on public.partner_balances from anon, authenticated, public;

/** Add a company, rename one, or take one out of the picker. */
create or replace function public.save_partner(
  p_id uuid,
  p_name text,
  p_phone text default null,
  p_active boolean default true,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'name required'; end if;

  if p_id is null then
    insert into delivery_partners(name_ar, phone, is_active, note)
      values (trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), p_active, nullif(trim(coalesce(p_note, '')), ''))
      returning id into v_id;
  else
    update delivery_partners
       set name_ar = trim(p_name),
           phone = nullif(trim(coalesce(p_phone, '')), ''),
           is_active = p_active,
           note = nullif(trim(coalesce(p_note, '')), '')
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'unknown partner'; end if;
  end if;
  return v_id;
end $$;

/** Log money received. Reduces the balance; never touches individual orders. */
create or replace function public.settle_partner(
  p_partner uuid,
  p_amount int,
  p_method text default 'transfer',
  p_note text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_balance int;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() limit 1;

  insert into partner_settlements(partner_id, amount, method, note, created_by)
    values (p_partner, p_amount,
            case when p_method in ('cash', 'transfer', 'other') then p_method else 'transfer' end,
            nullif(trim(coalesce(p_note, '')), ''), v_emp);

  select balance into v_balance from partner_balances where id = p_partner;
  return coalesce(v_balance, 0);
end $$;

/**
 * One company's statement between two dates.
 *
 * Orders and settlements in one list so the reader can follow the account the
 * way it actually moved, rather than reconciling two tables by eye.
 */
create or replace function public.partner_ledger(
  p_partner uuid,
  p_from date default null,
  p_to date default null
) returns table(
  kind text,
  ref uuid,
  at timestamptz,
  label text,
  amount int
)
language sql stable security definer set search_path = public as $$
  select 'order'::text,
         o.id,
         o.created_at,
         'طلب #' || lpad(o.order_seq::text, 3, '0'),
         (o.subtotal - o.discount + o.extra)::int
    from orders o
   where o.partner_id = p_partner
     and o.status <> 'cancelled'
     and (p_from is null or o.business_day >= p_from)
     and (p_to   is null or o.business_day <= p_to)
  union all
  select 'settlement'::text,
         s.id,
         s.created_at,
         coalesce(s.note, case s.method when 'cash' then 'تسوية نقدية'
                                        when 'transfer' then 'حوالة'
                                        else 'تسوية' end),
         -s.amount
    from partner_settlements s
   where s.partner_id = p_partner
     and (p_from is null or s.business_day >= p_from)
     and (p_to   is null or s.business_day <= p_to)
   order by 3 desc
$$;

/** The items on one aggregator order, for the breakdown row. */
create or replace function public.partner_order_items(p_order uuid)
returns table(name_ar text, flavor_ar text, qty int, line_total int)
language sql stable security definer set search_path = public as $$
  select oi.name_ar, oi.flavor_ar, oi.qty, oi.line_total
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.order_id = p_order and o.partner_id is not null
$$;

revoke all on function public.save_partner(uuid, text, text, boolean, text) from anon, public;
revoke all on function public.settle_partner(uuid, int, text, text) from anon, public;
revoke all on function public.partner_ledger(uuid, date, date) from anon, public;
revoke all on function public.partner_order_items(uuid) from anon, public;
grant execute on function public.save_partner(uuid, text, text, boolean, text) to authenticated;
grant execute on function public.settle_partner(uuid, int, text, text) to authenticated;
grant execute on function public.partner_ledger(uuid, date, date) to authenticated;
grant execute on function public.partner_order_items(uuid) to authenticated;
