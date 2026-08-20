-- Daily register closure: how much cash stays in the drawer at day end
-- (e.g. 25,000 kept as tomorrow's change float). One row per business day.
-- Service-role only (server actions gate with requireStaff; the Telegram bot
-- reads it with the service key for the nightly report).
create table if not exists public.register_closures (
  business_day date primary key,
  remaining integer not null check (remaining >= 0),
  note text,
  closed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.register_closures enable row level security;
revoke all on public.register_closures from anon, authenticated;
