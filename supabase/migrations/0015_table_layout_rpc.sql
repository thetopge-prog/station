-- Atomic floor-plan save + guest-count aggregate. Fixes two defects:
--  1) saveTables did delete-all + insert in two non-transactional calls — a
--     failed insert wiped the whole layout. This RPC does it in ONE function
--     (single transaction): a failed insert rolls back the delete too.
--  2) guest estimate summed order_items client-side via .in(ids), silently
--     capped at PostgREST's 1000-row limit. This aggregates server-side.

create or replace function public.save_cafe_tables(p_tables jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from cafe_tables where true;  -- explicit WHERE: pooler blocks unqualified DELETE
  insert into cafe_tables(name, kind, active, pos_x, pos_y, sort)
  select distinct on (trim(x->>'name'))
    trim(x->>'name'),
    case when x->>'kind' = 'outdoor' then 'outdoor' else 'indoor' end,
    coalesce((x->>'active')::boolean, true),
    greatest(0, least(100, coalesce(nullif(x->>'pos_x','')::real, 50))),
    greatest(0, least(100, coalesce(nullif(x->>'pos_y','')::real, 50))),
    coalesce(nullif(x->>'sort','')::int, 0)
  from jsonb_array_elements(p_tables) x
  where coalesce(trim(x->>'name'), '') <> ''
  order by trim(x->>'name'), coalesce(nullif(x->>'sort','')::int, 0);
end $$;
revoke all on function public.save_cafe_tables(jsonb) from anon, authenticated;

create or replace function public.guest_estimate(p_from date, p_to date)
returns integer language sql security definer set search_path = public as $$
  select coalesce(sum(oi.qty), 0)::int
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status = 'paid' and o.business_day between p_from and p_to;
$$;
revoke all on function public.guest_estimate(date, date) from anon, authenticated;
