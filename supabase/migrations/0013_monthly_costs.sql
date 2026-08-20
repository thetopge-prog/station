-- Fixed monthly costs (rent/electricity/generator/water): a persistent
-- baseline subtracted from the monthly net, set once by the admin. One row
-- per category. Service-role only (server actions gate; RLS no policies).
create table if not exists public.monthly_costs (
  category text primary key,
  amount integer not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.monthly_costs enable row level security;
revoke all on public.monthly_costs from anon, authenticated;

insert into public.monthly_costs(category, amount) values
  ('الإيجار', 0), ('الكهرباء', 0), ('المولد', 0), ('المياه', 0)
on conflict (category) do nothing;
