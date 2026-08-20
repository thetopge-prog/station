-- 0041_chef_picks.sql — split the recommendation engine in two.
--
-- 0039 left recommended_items() executable by anon and claimed in a comment
-- that it "exposes only names and selling prices". That was wrong: the function
-- returns margin and margin_pct, and «على ذوقكم» on the customer menu calls it
-- with the anon key. Any customer could have read the shop's margin on every
-- item straight off the REST endpoint.
--
-- Two functions now, with the boundary in the signature rather than in a
-- promise: staff get the reasoning, customers get a menu.

revoke execute on function public.recommended_items(int) from anon, public;
grant execute on function public.recommended_items(int) to authenticated, service_role;

/**
 * The customer-facing half. Same ranking, no commercial data — a name, a
 * category and the price the customer is about to pay.
 */
create or replace function public.chef_picks(p_limit int default 3)
returns table(id uuid, name_ar text, category_name text, price int)
language sql stable security definer set search_path = public as $$
  select r.id, r.name_ar, r.category_name, r.price
  from public.recommended_items(greatest(1, coalesce(p_limit, 3))) r;
$$;

grant execute on function public.chef_picks(int) to anon, authenticated, service_role;
