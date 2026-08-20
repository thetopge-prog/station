-- 0042_function_grants.sql — revoke from PUBLIC, not just from anon.
--
-- `revoke execute ... from anon` does NOT remove the implicit grant Postgres
-- gives to PUBLIC on every new function, and anon inherits PUBLIC. Several
-- migrations here have been writing the narrower revoke and assuming it closed
-- the door; it did not.
--
-- daily_fixed_cost is the one that mattered: no is_staff() guard inside, and it
-- returns the shop's rent, utilities and total wage bill.
--
-- Functions that are MEANT to be callable by a customer (place_order, get_card,
-- create_card, get_orders_public, chef_picks) are deliberately not touched.

do $$
declare f text;
begin
  foreach f in array array[
    'daily_fixed_cost()',
    'bep_today()',
    'my_open_session()',
    'pending_handover()',
    'busy_tables()',
    'current_expediter(uuid)',
    'session_report(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
