-- 0033_display_ads.sql — what the waiting-area TV shows when nothing is cooking.
--
-- A ceiling screen is on for 14 hours a day and the order board is empty for
-- most of them. An empty board is wasted advertising space and, worse, it makes
-- a working screen look broken to a customer walking in.
--
-- So the TV has two states, and the rule is deliberately simple: ANY order
-- between «تحت التحضير» and handover keeps the board up; the moment the last
-- one is handed over, the ads come back. Never a split screen — a customer
-- looking for their number must never have to hunt for it beside a poster.

create table if not exists public.display_ads (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  /** how long this slide holds, in seconds */
  duration_s int not null default 8 check (duration_s between 3 and 120),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.display_ads enable row level security;
revoke all on public.display_ads from anon, authenticated;

-- The TV is a signed-in staff device, so `authenticated` read is enough and the
-- ads never reach the public API.
grant select (id, title, image_url, duration_s, sort, is_active) on public.display_ads to authenticated;
create policy display_ads_staff_read on public.display_ads
  for select to authenticated using (is_active);
