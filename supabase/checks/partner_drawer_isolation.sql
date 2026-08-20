-- partner_drawer_isolation.sql — run it, expect it to "fail" with PROBE_OK.
--
--   node scripts/db-apply.mjs supabase/checks/partner_drawer_isolation.sql
--
-- The final RAISE aborts the transaction on purpose, so every row it wrote is
-- rolled back and the live database is untouched. Any OTHER error message is a
-- real failure of the invariant below.
--
-- Proves the ONE thing requirement 13 cannot get wrong: an aggregator order
-- must never enter the cashier's expected cash. Everything here is rolled back
-- by the deliberate PROBE_OK exception at the end, so nothing is left behind.
do $$
declare
  v_emp    uuid;
  v_free   uuid;
  v_user   uuid;
  v_partner uuid;
  v_session uuid;
  v_item   uuid;
  v_cash_order uuid;
  v_partner_order uuid;
  r record;
begin
  select e.id, e.auth_user_id into v_emp, v_user
    from employees e where e.auth_user_id is not null and e.is_active limit 1;
  if v_emp is null then raise exception 'no employee with a login to act as'; end if;

  -- act as that employee, the way PostgREST would
  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);
  if not public.is_staff() then raise exception 'jwt impersonation did not take'; end if;

  select id into v_item from menu_items where is_active limit 1;

  insert into delivery_partners(name_ar) values ('__probe__') returning id into v_partner;

  -- a cashier with no open drawer, so the report covers only our two probe
  -- orders and not somebody's live shift
  select e.id into v_free from employees e
   where not exists (select 1 from cashier_sessions s where s.cashier_id = e.id and s.closed_at is null)
   limit 1;
  if v_free is null then raise exception 'every employee already holds an open drawer'; end if;

  insert into cashier_sessions(cashier_id, opening_float)
    values (v_free, 100000) returning id into v_session;

  -- one ordinary cash sale
  insert into orders(business_day, order_seq, channel, status, subtotal, payment_method, session_id)
    values (current_date, 991, 'cashier', 'paid', 25000, 'cash', v_session)
    returning id into v_cash_order;

  -- one aggregator sale of the same size
  insert into orders(business_day, order_seq, channel, status, subtotal, payment_method, session_id, partner_id)
    values (current_date, 992, 'cashier', 'paid', 25000, 'partner', v_session, v_partner)
    returning id into v_partner_order;

  select * into r from session_report(v_session);

  raise notice 'opening_float=% cash_sales=% card_sales=% orders=% expected_cash=%',
    r.opening_float, r.cash_sales, r.card_sales, r.orders_count, r.expected_cash;

  if r.cash_sales <> 25000 then
    raise exception 'FAIL: cash_sales should be 25,000 (the cash order only), got %', r.cash_sales;
  end if;
  if r.expected_cash <> 125000 then
    raise exception 'FAIL: expected_cash should be 100,000 float + 25,000 cash = 125,000, got %', r.expected_cash;
  end if;
  if r.orders_count <> 2 then
    raise exception 'FAIL: the shift still took 2 orders, got %', r.orders_count;
  end if;

  -- and the company is billed for exactly its own order
  if (select balance from partner_balances where id = v_partner) <> 25000 then
    raise exception 'FAIL: partner balance should be 25,000';
  end if;

  -- a settlement reduces it
  perform settle_partner(v_partner, 10000, 'transfer', 'probe');
  if (select balance from partner_balances where id = v_partner) <> 15000 then
    raise exception 'FAIL: balance after a 10,000 settlement should be 15,000';
  end if;

  raise exception 'PROBE_OK — drawer isolation, billing and settlement all correct (rolled back)';
end $$;
