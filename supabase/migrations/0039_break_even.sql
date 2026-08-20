-- 0039_break_even.sql — daily break-even, item margins, and the recommendation
-- engine behind «على ذوقكم».
--
-- BEP is computed the honest way: gross profit today versus the day's share of
-- fixed costs. No assumed margin ratio, no forecast — just money in minus cost
-- of what was sold, against rent/utilities/wages pro-rated to one day. If the
-- owner has not entered those numbers the answer is "unknown", and the UI says
-- so rather than reporting a triumphant break-even at zero.
--
-- The margin ranking has one dependency worth stating: expiry pressure needs
-- recipe_lines to know which menu item consumes which ingredient. That table is
-- deliberately empty for now, so the boost is inert and ranking falls back to
-- pure margin. Fill in recipes and it starts working with no code change.

-- ── 1. what one day of trading has to cover ──────────────────────────────
create or replace function public.daily_fixed_cost()
returns table(rent_share int, wages_share int, total int, configured boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := extract(day from date_trunc('month', (now() at time zone 'Asia/Baghdad')) + interval '1 month - 1 day');
  v_monthly int;
  v_wages int;
begin
  select coalesce(sum(amount), 0)::int into v_monthly from monthly_costs;

  -- normalise every wage to a per-day figure so mixed periods add up correctly
  select coalesce(sum(
    case wage_period
      when 'daily' then wage_amount
      when 'weekly' then round(wage_amount / 7.0)
      when 'monthly' then round(wage_amount::numeric / v_days)
      else 0
    end
  ), 0)::int into v_wages
  from employees where is_active;

  rent_share := round(v_monthly::numeric / v_days);
  wages_share := v_wages;
  total := rent_share + wages_share;
  -- "configured" is what stops the UI claiming break-even was met at zero
  configured := (v_monthly > 0 or v_wages > 0);
  return next;
end $$;

-- ── 2. where today stands ────────────────────────────────────────────────
create or replace function public.bep_today()
returns table(
  fixed_cost int,
  revenue int,
  cogs int,
  gross_profit int,
  remaining int,
  met boolean,
  configured boolean,
  orders_count int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_fixed record;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select * into v_fixed from public.daily_fixed_cost();

  select
    coalesce(sum(o.subtotal - o.discount + o.extra), 0)::int,
    coalesce(sum(o.cost_total), 0)::int,
    count(*)::int
  into revenue, cogs, orders_count
  from orders o
  where o.business_day = (now() at time zone 'Asia/Baghdad')::date
    and o.status = 'paid';

  fixed_cost := v_fixed.total;
  configured := v_fixed.configured;
  gross_profit := revenue - cogs;
  remaining := greatest(0, v_fixed.total - (revenue - cogs));
  met := v_fixed.configured and (revenue - cogs) >= v_fixed.total;
  return next;
end $$;

-- ── 3. per-item margin, with expiry pressure ─────────────────────────────
/**
 * Every active item with its contribution and how urgently it should be pushed.
 *
 * `expiry_pressure` is the number of days until the SOONEST-expiring ingredient
 * this item consumes goes off. Null when the item has no recipe — which is
 * every item today — and the recommendation engine simply ignores it then.
 */
create or replace view public.menu_margins as
  select
    mi.id,
    mi.name_ar,
    c.name_ar as category_name,
    mi.price,
    mi.cost,
    (mi.price - mi.cost) as margin,
    case when mi.price > 0 then round(((mi.price - mi.cost)::numeric / mi.price) * 100)::int else 0 end as margin_pct,
    (
      select min(ss.nearest_expiry - (now() at time zone 'Asia/Baghdad')::date)
      from public.recipe_lines rl
      join public.stock_status ss on ss.id = rl.ingredient_id
      where rl.item_id = mi.id and ss.nearest_expiry is not null
    ) as expiry_pressure
  from public.menu_items mi
  join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active;
grant select on public.menu_margins to authenticated;

/**
 * What to push right now.
 *
 * Score = margin, boosted hard when an ingredient is about to expire. Selling a
 * dish whose stock spoils tomorrow is worth more than its margin suggests,
 * because the alternative is binning the ingredient at full cost.
 *
 * Items with no cost entered are EXCLUDED, not ranked first. A zero cost looks
 * like 100% margin and would otherwise dominate the list with nonsense — better
 * to recommend nothing than to recommend confidently from missing data.
 */
create or replace function public.recommended_items(p_limit int default 6)
returns table(
  id uuid,
  name_ar text,
  category_name text,
  price int,
  margin int,
  margin_pct int,
  expiry_pressure int,
  reason text
)
language sql stable security definer set search_path = public as $$
  select
    m.id, m.name_ar, m.category_name, m.price, m.margin, m.margin_pct, m.expiry_pressure,
    case
      when m.expiry_pressure is not null and m.expiry_pressure <= 2 then 'قرب انتهاء المكوّنات'
      else 'هامش مرتفع'
    end as reason
  from public.menu_margins m
  where m.cost > 0 and m.price > 0
  order by
    (m.margin
      + case
          when m.expiry_pressure is null then 0
          when m.expiry_pressure <= 0 then 100000   -- expiring today: clear it
          when m.expiry_pressure <= 2 then 50000
          when m.expiry_pressure <= 5 then 10000
          else 0
        end
    ) desc,
    m.margin_pct desc
  limit greatest(1, coalesce(p_limit, 6));
$$;

revoke execute on function public.bep_today() from anon;
revoke execute on function public.daily_fixed_cost() from anon;
-- recommended_items stays anon-callable: «على ذوقكم» is on the customer menu,
-- and it exposes only names and SELLING prices, never cost or margin. The view
-- it reads is not granted to anon — the function's definer rights are the gate.
