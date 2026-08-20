-- Daily per-item offer (used by the hot-drink pastry cross-sell): management sets
-- a special price today for an item, offer_price 0 = مجاناً. One row per item/day.
create table if not exists public.item_offers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  offer_price int not null check (offer_price >= 0),
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  note text,
  created_at timestamptz not null default now(),
  unique (item_id, business_day)
);
alter table public.item_offers enable row level security;
revoke all on public.item_offers from anon, authenticated;

-- today's offers, readable by the public menu (item_id → price, no sensitive data)
create or replace view public.active_item_offers as
  select item_id, offer_price
  from public.item_offers
  where business_day = (now() at time zone 'Asia/Baghdad')::date;
grant select on public.active_item_offers to anon, authenticated;
