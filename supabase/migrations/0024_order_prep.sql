-- 0024_order_prep.sql — kitchen/expediter/queue columns on orders.
-- Consumes the enums added in 0023 (separate file, see the note there).

alter table public.orders
  add column if not exists prep_status public.prep_status not null default 'new',
  add column if not exists expediter_id uuid references public.employees(id) on delete set null,
  add column if not exists pickup_code text,      -- the «رمز الأمان» shown on the TV
  add column if not exists eta_minutes int check (eta_minutes is null or eta_minutes between 1 and 240),
  add column if not exists customer_phone text,   -- delivery / pickup orders
  add column if not exists address_note text;     -- delivery orders

-- Unique per DAY, not globally: a 4-digit code repeating next week is fine and
-- keeps the number short enough to read off a TV across the room.
create unique index if not exists orders_pickup_code_day_idx
  on public.orders(business_day, pickup_code) where pickup_code is not null;

-- The KDS / expediter / queue hot path. Partial: finished orders are the vast
-- majority of the table and never appear on a screen.
create index if not exists orders_prep_status_idx
  on public.orders(prep_status) where prep_status <> 'handed';

-- Extend the existing column grant from 0002. cost_total stays REVOKED — the
-- grant, not the type, is the cost/profit security boundary.
grant select (prep_status, expediter_id, pickup_code, eta_minutes, customer_phone, address_note)
  on public.orders to authenticated;
