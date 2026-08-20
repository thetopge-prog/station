-- Pastry inventory with a 6-day shelf-life counter + promotional offers.
-- Both are service-role only; customers read active offers through a definer view.

create table if not exists public.pastry_batches (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  quantity int not null default 0 check (quantity >= 0),
  deposited_on date not null default (now() at time zone 'Asia/Baghdad')::date,
  shelf_days int not null default 6,
  active boolean not null default true,      -- false = sold out / discarded
  note text,
  created_at timestamptz not null default now()
);
alter table public.pastry_batches enable row level security;
revoke all on public.pastry_batches from anon, authenticated;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  active boolean not null default true,
  auto boolean not null default false,        -- generated from an expiring pastry batch
  batch_id uuid references public.pastry_batches(id) on delete cascade,
  ends_on date,                                -- null = no end date
  created_at timestamptz not null default now()
);
alter table public.offers enable row level security;
revoke all on public.offers from anon, authenticated;

-- customers read only currently-active offers (no sensitive data) via a definer
-- view — same pattern as menu_public.
create or replace view public.active_offers as
  select id, title, description
  from public.offers
  where active
    and (ends_on is null or ends_on >= (now() at time zone 'Asia/Baghdad')::date)
  order by created_at desc;
grant select on public.active_offers to anon, authenticated;
