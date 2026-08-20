-- Web Push subscriptions: one row per staff device that enabled notifications.
-- Written/read ONLY via the service-role client (server actions gate with
-- requireStaff); RLS enabled with no policies = no anon/authenticated access.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
