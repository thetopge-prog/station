-- 0022_printers.sql — the 5 thermal printers, as DATA not code.
--
-- Hardware isn't bought yet, so host/share stay null: the routing logic works
-- today (it just produces tickets nobody prints) and goes live the moment the
-- owner fills in IPs on /printers. Supports both wiring styles:
--   host + port  → raw TCP ESC/POS (network printer, the plan's default)
--   share        → Windows printer share \127.0.0.1\<share> (USB printer)
-- Service-role only, matching every table added after 0009.

create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  kind text not null check (kind in ('receipt', 'station', 'expediter')),
  station_id uuid references public.stations(id) on delete set null,
  host text,                              -- e.g. '192.168.1.51'; null ⇒ use share
  port int not null default 9100,
  share text,                             -- e.g. 'POS80'; null ⇒ use host
  copies int not null default 1 check (copies between 1 and 3),
  -- How Arabic reaches this device. cp1256 = send unshaped letters and let the
  -- printer firmware join them; utf8 = we shape the letters ourselves. Which one
  -- works is a property of the hardware, so /printers prints a test slip in both.
  codepage text not null default 'cp1256' check (codepage in ('cp1256', 'utf8')),
  is_active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- a station printer must name its station; receipt/expediter must not
  constraint printers_station_match check (
    (kind = 'station' and station_id is not null) or
    (kind <> 'station' and station_id is null)
  )
);
alter table public.printers enable row level security;
revoke all on public.printers from anon, authenticated;

-- The 5 printers from the spec. Seeded unconfigured (no host/share) and
-- inactive so a half-set-up shop never blocks checkout on a missing device.
insert into public.printers(name_ar, kind, station_id, sort, is_active)
select v.name_ar, v.kind::text, s.id, v.sort, false
from (values
  ('طابعة الكاشير',   'receipt',   null,         1),
  ('فرن البيتزا',      'station',   'pizza_oven', 2),
  ('محطة البرجر',      'station',   'burger',     3),
  ('الشواية',          'station',   'grill',      4),
  ('محطة التجهيز',     'expediter', null,         5)
) as v(name_ar, kind, station_key, sort)
left join public.stations s on s.name_en = v.station_key
where not exists (select 1 from public.printers p where p.name_ar = v.name_ar);
