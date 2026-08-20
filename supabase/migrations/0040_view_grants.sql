-- 0040_view_grants.sql — close the anon grants that Supabase hands out by default.
--
-- WHY THIS EXISTS: this project's whole cost/profit security model (0002) is
-- built on REVOKING columns from anon and authenticated. That works for tables,
-- and every table added since has an explicit `revoke all ... from anon`.
--
-- Views were the hole. Supabase's default privileges grant ALL on new objects
-- in `public` to anon and authenticated, so each view created since 0028 shipped
-- world-readable — including:
--
--   menu_margins   cost and margin per item     ← the exact column 0002 protects
--   stock_status   avg_unit_cost                ← what the shop pays suppliers
--   active_shifts  who is working right now
--
-- Adding `grant select ... to authenticated` (as those migrations did) is not a
-- restriction; it is a no-op on top of a grant that was already wider. The fix
-- is to revoke first and then grant back exactly what is needed.
--
-- Caught by an assertion in a throwaway verification script, not by review.

do $$
declare v text;
begin
  foreach v in array array['menu_margins', 'stock_status', 'active_shifts', 'queue_public']
  loop
    execute format('revoke all on public.%I from anon, authenticated', v);
  end loop;
end $$;

-- Grant back the minimum. All four are staff-facing; nothing here is public.
--
-- queue_public is the interesting one: the waiting-area TV reads it, but that
-- screen authenticates with STATION_DISPLAY_KEY and goes through the SERVICE
-- client (see src/lib/cafe/queue-actions.ts), which bypasses these grants
-- entirely. Anon never needed access, and it carries no money column anyway.
grant select on public.menu_margins  to authenticated;
grant select on public.stock_status  to authenticated;
grant select on public.active_shifts to authenticated;
grant select on public.queue_public  to authenticated;

-- Belt and braces for the two views that carry real commercial numbers: even a
-- future accidental grant should not expose them, so make the underlying access
-- explicit rather than relying on this file being the last word.
revoke all on public.menu_margins from anon;
revoke all on public.stock_status from anon;
