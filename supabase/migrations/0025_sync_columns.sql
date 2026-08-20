-- 0025_sync_columns.sql — columns the Station Hub ↔ Supabase sync needs.
--
-- `source` records who created the row so the hub never re-downloads its own
-- writes. `updated_at` is the last-writer-wins tiebreaker for the handful of
-- mutable fields (status, prep_status, clean_status); every other row in this
-- system is append-only and dedupes on its uuid primary key instead.
--
-- ponytail: LWW on prep_status is safe because one order is served by one shop
-- at one moment. A second branch would need per-field vector clocks.
--
-- Written out per table rather than looped: the loop version needed nested
-- dollar-quoting inside format(), which Postgres cannot parse unambiguously.
-- Six repeated lines beat a clever one that does not run.

alter table public.orders
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source text not null default 'cloud' check (source in ('hub', 'cloud'));

alter table public.order_items
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source text not null default 'cloud' check (source in ('hub', 'cloud'));

alter table public.loyalty_events
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source text not null default 'cloud' check (source in ('hub', 'cloud'));

alter table public.expenses
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source text not null default 'cloud' check (source in ('hub', 'cloud'));

alter table public.debt_entries
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source text not null default 'cloud' check (source in ('hub', 'cloud'));

alter table public.cafe_tables
  add column if not exists updated_at_sync timestamptz not null default now(),
  add column if not exists source text not null default 'cloud' check (source in ('hub', 'cloud'));

-- one shared touch trigger for the two tables whose rows actually mutate
create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_orders on public.orders;
create trigger trg_touch_orders before update on public.orders
  for each row execute function public.touch_updated_at();

grant select (updated_at, source) on public.orders to authenticated;

-- Sequence split so a hub order and a cloud order can never collide on
-- unique(business_day, order_seq): the hub takes 1..899, web delivery/pickup
-- orders take 900+. Cheap, and the number stays readable to staff.
create table if not exists public.order_counters_remote (
  business_day date primary key,
  last_seq int not null default 900
);
alter table public.order_counters_remote enable row level security;
revoke all on public.order_counters_remote from anon, authenticated;
