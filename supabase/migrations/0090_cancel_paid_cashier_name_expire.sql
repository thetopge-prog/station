-- ═══ إلغاء طلب مدفوع خلال 90 دقيقة · اسم الكاشير على الوردية · الشاشة تنظّف نفسها ═══

-- ── 1) إلغاء طلب مدفوع ─────────────────────────────────────────────────────
-- الزبون يتأخر عنه المندوب أو يغيّر رأيه بعد الدفع. كان الحلّ «ديناً» باسم
-- «الغاء» (رأيناه في الدفتر). الآن الكاشير يلغيه من سجلّ الطلبات خلال 90
-- دقيقة من الدفع، بسبب. كل التقارير تفلتر status='paid' فيسقط المبلغ من النقد
-- والوردية وحده؛ نقاط الولاء تُعكس، والدين المرتبط يُسدَّد بسطر مقابل.
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid references public.employees(id) on delete set null;
grant select (cancel_reason, cancelled_at) on public.orders to authenticated;

create or replace function public.cancel_paid_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_o public.orders; v_pts int; v_total int;
begin
  if not public.is_role('cashier') then raise exception 'not authorized'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  select * into v_o from orders where id = p_order;
  if v_o.id is null then raise exception 'order not found'; end if;
  if v_o.status <> 'paid' then raise exception 'order not paid'; end if;
  if v_o.paid_at < now() - interval '90 minutes' then raise exception 'too late'; end if;

  update orders set status = 'cancelled', cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 120), ''),
                    cancelled_at = now(), cancelled_by = v_emp
   where id = p_order;

  -- النقاط التي مُنحت على هذا الطلب تعود
  select coalesce(sum(delta), 0) into v_pts from loyalty_events where order_id = p_order and reason = 'earn_order';
  if v_pts > 0 and v_o.customer_id is not null then
    insert into loyalty_events(customer_id, order_id, delta, reason) values (v_o.customer_id, p_order, -v_pts, 'cancel');
  end if;

  -- بيع بالدين: يُسدَّد دفترياً بالمبلغ نفسه حتى لا يبقى ديناً على من لم يأخذ شيئاً
  if v_o.payment_method = 'debt' then
    v_total := greatest(0, v_o.subtotal - v_o.discount + v_o.extra);
    insert into debt_entries(customer_name, phone, kind, amount, note, session_id, created_by)
    select d.customer_name, d.phone, 'credit', v_total, 'إلغاء طلب #' || lpad(v_o.order_seq::text, 3, '0'), v_o.session_id, v_emp
      from debt_entries d where d.note = 'طلب #' || lpad(v_o.order_seq::text, 3, '0') and d.kind = 'debit'
     order by d.created_at desc limit 1;
  end if;
end $$;
revoke execute on function public.cancel_paid_order(uuid, text) from anon;

-- ── 2) اسم الكاشير الفعلي ────────────────────────────────────────────────
-- الحسابات مشتركة («كاشير») فالوصل يطبع «كاشير». عند بدء الوردية يكتب
-- الموظف اسمه، ويُطبع ويُقرأ من هنا بدل اسم الحساب.
alter table public.cashier_sessions add column if not exists cashier_name text;
grant select (cashier_name) on public.cashier_sessions to authenticated;

create or replace function public.set_session_cashier_name(p_session uuid, p_name text)
returns void language sql security definer set search_path = public as $$
  update cashier_sessions set cashier_name = nullif(left(trim(coalesce(p_name, '')), 60), '')
   where id = p_session and closed_at is null
     and cashier_id = (select e.id from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1);
$$;
revoke execute on function public.set_session_cashier_name(uuid, text) from anon;

-- ── 3) الجاهز يُرفع من الشاشة بعد خمس دقائق ─────────────────────────────
-- لا مؤقّت خارجي: تُستدعى في مسار قراءة الشاشة والتجهيز (كما attendance_autoclose).
-- تُعيد ما رُفع الآن ليُبلَّغ به الكاشير.
create or replace function public.expire_ready(p_minutes int default 5)
returns setof int language sql security definer set search_path = public as $$
  update orders set prep_status = 'handed'
   where prep_status = 'ready' and status <> 'cancelled'
     and updated_at < now() - make_interval(mins => greatest(1, p_minutes))
  returning order_seq;
$$;
revoke execute on function public.expire_ready(int) from anon;

notify pgrst, 'reload schema';
