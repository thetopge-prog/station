-- 0005_employee_wages.sql — wage fields on employees (daily/weekly/monthly pay).
-- Wage payments are recorded as expenses (category «رواتب») so they flow straight
-- into the daily net — no separate payroll ledger needed. Idempotent.
alter table public.employees
  add column if not exists wage_amount int not null default 0 check (wage_amount >= 0);
alter table public.employees
  add column if not exists wage_period text check (wage_period in ('daily', 'weekly', 'monthly'));
