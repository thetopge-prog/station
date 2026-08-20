-- «تصفير الحساب اليومي» — internal shift-settlement reset. Non-destructive:
-- records a timestamp; the dashboard's TODAY view counts only orders/expenses
-- after the latest reset, while the Telegram bot keeps the full business day.
create table if not exists public.daily_resets (
  id uuid primary key default gen_random_uuid(),
  reset_at timestamptz not null default now(),
  by_employee uuid,
  created_at timestamptz not null default now()
);
alter table public.daily_resets enable row level security;
revoke all on public.daily_resets from anon, authenticated;
