-- 0036_cashier_sessions.sql — independent cashier sessions, Z-report, handover.
--
-- The shop currently has no way to answer "who was on the till when this money
-- went missing". Orders carry a cashier_id, but a cashier works several stints
-- a day and the drawer is never reconciled against a starting float. This adds
-- the session as a first-class object and hangs every money movement off it.
--
-- PREREQUISITE FIXED HERE: orders.payment_method did not exist. The POS asked
-- cash-or-card only to decide whether to pop the drawer and then threw the
-- answer away — so "cash sales" was literally uncomputable. Without this column
-- a Z-report cannot be written at all.

-- ── 1. payment method, at last ────────────────────────────────────────────
alter table public.orders
  add column if not exists payment_method text,
  add column if not exists session_id uuid;

do $$ begin
  alter table public.orders add constraint orders_payment_method_chk
    check (payment_method is null or payment_method in ('cash', 'card'));
exception when duplicate_object then null; end $$;

grant select (payment_method, session_id) on public.orders to authenticated;

-- ── 2. the session ────────────────────────────────────────────────────────
create table if not exists public.cashier_sessions (
  id uuid primary key default gen_random_uuid(),
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  cashier_id uuid not null references public.employees(id) on delete restrict,

  opened_at timestamptz not null default now(),
  /** المبلغ الافتتاحي — cash physically in the drawer at the start */
  opening_float int not null default 0 check (opening_float >= 0),
  /** set when this session started by taking over the previous drawer */
  opened_from uuid references public.cashier_sessions(id) on delete set null,

  closed_at timestamptz,
  /** what the cashier physically counted at the end */
  counted_cash int check (counted_cash is null or counted_cash >= 0),
  /** handed up to management, so it leaves the drawer */
  deposited int not null default 0 check (deposited >= 0),
  /** computed by close_cashier_session — stored so the Z-report is a record,
      not a query that would change if an old order were later edited */
  expected_cash int,
  /** counted - expected. Negative = short. The number the owner actually reads. */
  variance int,
  close_note text,

  /** handover: who the drawer was passed to, and whether they confirmed it */
  handover_to uuid references public.employees(id) on delete set null,
  handover_amount int check (handover_amount is null or handover_amount >= 0),
  handover_confirmed_at timestamptz,
  /** what the receiving cashier actually counted — the second half of the audit */
  handover_counted int,

  created_at timestamptz not null default now()
);

-- one open session per cashier: a second one would split their own takings
create unique index if not exists cashier_sessions_one_open
  on public.cashier_sessions(cashier_id) where closed_at is null;
create index if not exists cashier_sessions_day_idx
  on public.cashier_sessions(business_day);

alter table public.cashier_sessions enable row level security;
revoke all on public.cashier_sessions from anon, authenticated;
grant select (id, business_day, cashier_id, opened_at, opening_float, closed_at,
              counted_cash, deposited, expected_cash, variance, close_note,
              handover_to, handover_amount, handover_confirmed_at, handover_counted)
  on public.cashier_sessions to authenticated;
create policy cashier_sessions_staff_read on public.cashier_sessions
  for select to authenticated using (public.is_staff());

-- ── 3. every money movement points at a session ──────────────────────────
alter table public.expenses    add column if not exists session_id uuid references public.cashier_sessions(id) on delete set null;
alter table public.debt_entries add column if not exists session_id uuid references public.cashier_sessions(id) on delete set null;

do $$ begin
  alter table public.orders add constraint orders_session_fk
    foreign key (session_id) references public.cashier_sessions(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists orders_session_idx on public.orders(session_id) where session_id is not null;

-- ── 4. the current session for the signed-in cashier ─────────────────────
create or replace function public.my_open_session()
returns uuid language sql stable security definer set search_path = public as $$
  select s.id
  from public.cashier_sessions s
  join public.employees e on e.id = s.cashier_id
  where s.closed_at is null and e.auth_user_id = auth.uid()
  limit 1;
$$;

/**
 * Open a shift.
 *
 * `p_float` is the cash counted into the drawer at the start. When taking over
 * a colleague's drawer, p_from_session ties the two together and records what
 * was actually counted — that pair (handed / counted) is the whole point of the
 * handover protocol, because a mismatch is the moment a loss becomes visible.
 */
create or replace function public.open_cashier_session(
  p_float int,
  p_from_session uuid default null,
  p_counted int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  if v_emp is null then raise exception 'no employee record'; end if;

  if exists (select 1 from cashier_sessions where cashier_id = v_emp and closed_at is null) then
    raise exception 'session already open';
  end if;

  -- confirming receipt closes out the predecessor's audit trail
  if p_from_session is not null then
    update cashier_sessions
       set handover_confirmed_at = now(),
           handover_counted = coalesce(p_counted, p_float)
     where id = p_from_session and handover_confirmed_at is null;
  end if;

  insert into cashier_sessions(cashier_id, opening_float, opened_from)
    values (v_emp, greatest(0, coalesce(p_float, 0)), p_from_session)
    returning id into v_id;
  return v_id;
end $$;

/**
 * The Z-report, computed live for an open session.
 *
 *   (opening float + cash sales + delivery cash) - expenses - deposits
 *
 * Card takings are reported separately and deliberately excluded from the
 * drawer maths: they never enter it. Debts issued are reported too, because a
 * drawer that is short by exactly the debts written is a different story from
 * one that is simply short.
 */
create or replace function public.session_report(p_session uuid)
returns table(
  opening_float int,
  cash_sales int,
  card_sales int,
  orders_count int,
  expenses_total int,
  deposited int,
  debts_issued int,
  expected_cash int
)
language plpgsql stable security definer set search_path = public as $$
declare v_s public.cashier_sessions;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select * into v_s from cashier_sessions where id = p_session;
  if not found then raise exception 'unknown session'; end if;

  select
    v_s.opening_float,
    coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.payment_method = 'cash'), 0)::int,
    coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.payment_method = 'card'), 0)::int,
    count(o.id)::int
  into opening_float, cash_sales, card_sales, orders_count
  from orders o
  where o.session_id = p_session and o.status = 'paid';

  select coalesce(sum(e.amount), 0)::int into expenses_total
    from expenses e where e.session_id = p_session;

  select coalesce(sum(d.amount) filter (where d.kind = 'debit'), 0)::int into debts_issued
    from debt_entries d where d.session_id = p_session;

  deposited := v_s.deposited;
  expected_cash := opening_float + cash_sales - expenses_total - v_s.deposited;
  return next;
end $$;

/**
 * Close the shift and freeze the numbers.
 *
 * expected_cash is STORED rather than recomputed on read: a Z-report is a
 * record of what was true at handover time. If an order were later refunded or
 * an expense corrected, a recomputed report would quietly rewrite history and
 * a real shortage would disappear.
 */
create or replace function public.close_cashier_session(
  p_session uuid,
  p_counted int,
  p_deposited int default 0,
  p_handover_to uuid default null,
  p_note text default null
) returns table(expected_cash int, variance int)
language plpgsql security definer set search_path = public as $$
declare
  v_rep record;
  v_expected int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;

  update cashier_sessions set deposited = greatest(0, coalesce(p_deposited, 0)) where id = p_session;
  select * into v_rep from public.session_report(p_session);
  v_expected := v_rep.expected_cash;

  update cashier_sessions
     set closed_at = now(),
         counted_cash = greatest(0, coalesce(p_counted, 0)),
         expected_cash = v_expected,
         variance = greatest(0, coalesce(p_counted, 0)) - v_expected,
         close_note = nullif(trim(coalesce(p_note, '')), ''),
         handover_to = p_handover_to,
         -- whatever was not deposited upstairs is what physically moves on
         handover_amount = greatest(0, coalesce(p_counted, 0))
   where id = p_session;

  return query select v_expected, greatest(0, coalesce(p_counted, 0)) - v_expected;
end $$;

/** A closed drawer waiting for its next cashier to count and accept it. */
create or replace function public.pending_handover()
returns table(session_id uuid, from_name text, amount int, closed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, e.name_ar, s.handover_amount, s.closed_at
  from public.cashier_sessions s
  join public.employees e on e.id = s.cashier_id
  where s.closed_at is not null
    and s.handover_confirmed_at is null
    and s.handover_amount is not null
    and s.handover_amount > 0
  order by s.closed_at desc
  limit 1;
$$;

revoke execute on function public.open_cashier_session(int, uuid, int) from anon;
revoke execute on function public.close_cashier_session(uuid, int, int, uuid, text) from anon;
revoke execute on function public.session_report(uuid) from anon;
revoke execute on function public.pending_handover() from anon;
revoke execute on function public.my_open_session() from anon;
