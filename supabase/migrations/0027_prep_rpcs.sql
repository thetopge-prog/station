-- 0027_prep_rpcs.sql — kitchen/expediter transitions. security definer + is_staff(),
-- same discipline as mark_order_paid/cancel_order. Never touches orders.status.

create or replace function public.set_prep_status(p_order uuid, p_status public.prep_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  update orders set prep_status = p_status where id = p_order;
end $$;

-- The expediter claims the order; their name is what the customer TV shows.
-- Idempotent: re-claiming keeps the original expediter (first claim wins), so a
-- double-tap on a touchscreen can't steal an order from a colleague.
create or replace function public.claim_expediter(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  update orders
     set expediter_id = coalesce(expediter_id, v_emp),
         prep_status  = case when prep_status = 'new' then 'preparing' else prep_status end
   where id = p_order;
end $$;

create or replace function public.mark_ready(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  update orders
     set prep_status  = 'ready',
         expediter_id = coalesce(expediter_id, v_emp)
   where id = p_order;
end $$;

revoke execute on function public.set_prep_status(uuid, public.prep_status) from anon;
revoke execute on function public.claim_expediter(uuid) from anon;
revoke execute on function public.mark_ready(uuid) from anon;
