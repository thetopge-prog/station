-- سجل الديون — a receivables ledger. Each row is one movement: a «debit» (the
-- customer took on credit) or a «credit» (the customer paid). A debtor's
-- balance = sum(debit) − sum(credit). Non-destructive, service-role only.
create table if not exists public.debt_entries (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text,
  kind text not null check (kind in ('debit', 'credit')),
  amount int not null check (amount > 0),
  note text,
  created_by uuid,
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  created_at timestamptz not null default now()
);
alter table public.debt_entries enable row level security;
revoke all on public.debt_entries from anon, authenticated;
create index if not exists debt_entries_name_idx on public.debt_entries (customer_name);

-- one row per debtor with running totals; read by staff via the service client.
create or replace view public.debtor_balances as
select
  customer_name,
  max(phone) as phone,
  sum(case when kind = 'debit' then amount else 0 end)::int as total_debt,
  sum(case when kind = 'credit' then amount else 0 end)::int as total_paid,
  sum(case when kind = 'debit' then amount else -amount end)::int as balance,
  max(created_at) as last_activity
from public.debt_entries
group by customer_name;
revoke all on public.debtor_balances from anon, authenticated;
