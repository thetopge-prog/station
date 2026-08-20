-- 0031_shifts_sources.sql — shift tracking, staff accountability, order sources.
--
-- WHY THIS EXISTS: the expediter assembly ticket must name the مجهّز, but it
-- prints the instant the cashier takes payment — before anybody has touched the
-- order. There is nothing to print unless the system already knows who is on
-- the expediter station right now. That is a shift, not an order property.
--
-- So: one open shift row per station role, opened at the start of service and
-- read at print time. The cashier can set it from the POS (shops share one
-- terminal and the مجهّز does not always sign in on their own device), and an
-- expediter signing in on their own screen claims it automatically.

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  role text not null check (role in ('cashier', 'expediter', 'chef', 'cleaner')),
  employee_id uuid not null references public.employees(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shifts_open_idx
  on public.shifts(business_day, role) where closed_at is null;

alter table public.shifts enable row level security;
revoke all on public.shifts from anon, authenticated;
grant select (id, business_day, role, employee_id, station_id, opened_at, closed_at)
  on public.shifts to authenticated;
create policy shifts_staff_read on public.shifts
  for select to authenticated using (public.is_staff());

-- Who is on a role right now. One row per (role, station) — a shop with two
-- expediters on at once gets two rows, and the POS picks which one it stamps.
create or replace view public.active_shifts as
  select s.id, s.role, s.employee_id, s.station_id, s.opened_at,
         e.name_ar as employee_name,
         st.name_ar as station_name
  from public.shifts s
  join public.employees e on e.id = s.employee_id
  left join public.stations st on st.id = s.station_id
  where s.closed_at is null
    and s.business_day = (now() at time zone 'Asia/Baghdad')::date
  order by s.opened_at;
grant select on public.active_shifts to authenticated;

/**
 * Open a shift, closing any the same person already has on that role today.
 * Idempotent by design: tapping «فلان على التجهيز» twice must not create two
 * open rows and make the ticket ambiguous.
 */
create or replace function public.open_shift(
  p_role text,
  p_employee uuid,
  p_station uuid default null,
  p_exclusive boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_actor uuid;
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_actor from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  -- exclusive roles (expediter, cashier) have exactly one holder per station so
  -- the printed name is never ambiguous; chefs/cleaners may overlap freely
  if p_exclusive then
    update shifts set closed_at = now()
     where closed_at is null and business_day = v_day and role = p_role
       and station_id is not distinct from p_station;
  else
    update shifts set closed_at = now()
     where closed_at is null and business_day = v_day and role = p_role
       and employee_id = p_employee;
  end if;

  insert into shifts(business_day, role, employee_id, station_id, opened_by)
    values (v_day, p_role, p_employee, p_station, v_actor)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.close_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  update shifts set closed_at = now() where id = p_shift and closed_at is null;
end $$;

revoke execute on function public.open_shift(text, uuid, uuid, boolean) from anon;
revoke execute on function public.close_shift(uuid) from anon;

-- ── order source ─────────────────────────────────────────────────────────
-- `channel` already records HOW the order was placed (cashier/qr/kiosk/
-- delivery/pickup). `source` here records WHICH SYSTEM created it, so a future
-- WhatsApp bot is distinguishable from a customer using the web menu even
-- though both are channel='delivery'.
alter table public.orders
  add column if not exists order_source text not null default 'pos';
do $$ begin
  alter table public.orders add constraint orders_order_source_chk
    check (order_source in ('pos', 'web', 'whatsapp'));
exception when duplicate_object then null; end $$;

-- customer name for delivery tickets (phone/address landed in 0024)
alter table public.orders
  add column if not exists customer_name text;

grant select (order_source, customer_name) on public.orders to authenticated;
