-- 0021_stations_roles.sql — «ستيشن» kitchen stations + the 4 new staff roles.
--
-- A "station" is a physical prep point with its own chef and its own printer
-- (pizza oven, burger, grill, fryer). categories.station_id is THE routing
-- table: it decides which station ticket an item lands on. Keeping it in data
-- rather than in code means a new category (or a re-assignment, e.g. moving
-- fries from the fryer to the grill) is an admin edit, not a deploy.
-- Idempotent.

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null unique,          -- stable key used by seeds/tests
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.stations enable row level security;
revoke all on public.stations from anon, authenticated;
-- the POS/KDS needs to read station names to label tickets and filter screens
grant select (id, name_ar, name_en, sort, is_active) on public.stations to authenticated;
create policy stations_auth_read on public.stations
  for select to authenticated using (is_active);

insert into public.stations(name_ar, name_en, sort) values
  ('فرن البيتزا', 'pizza_oven', 1),
  ('محطة البرجر', 'burger',     2),
  ('الشواية',     'grill',      3),
  ('المقلاة',     'fryer',      4)
on conflict (name_en) do nothing;

-- ── routing: category → station ────────────────────────────────────────────
-- null = no station ticket (sauces, drinks): the item still shows on the
-- customer receipt and the expediter assembly ticket, it just isn't cooked.
alter table public.categories
  add column if not exists station_id uuid references public.stations(id) on delete set null;

-- ── the 4 job types (8 people = 2 per type; headcount needs no schema) ─────
-- roles are rows, not an enum — is_admin() matches on name_en.
insert into public.roles(name_ar, name_en)
  select 'مجهّز طلبات', 'expediter' where not exists (select 1 from public.roles where name_en = 'expediter');
insert into public.roles(name_ar, name_en)
  select 'طبّاخ', 'chef'            where not exists (select 1 from public.roles where name_en = 'chef');
insert into public.roles(name_ar, name_en)
  select 'تنظيف الطاولات', 'cleaner' where not exists (select 1 from public.roles where name_en = 'cleaner');

-- which station a chef's KDS shows; null for every non-chef role
alter table public.employees
  add column if not exists station_id uuid references public.stations(id) on delete set null;
