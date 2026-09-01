-- إغلاق ما كشفه الفحص الشامل.
--
-- الخيط الجامع لكل ما تحت: الصلاحية كانت في التطبيق لا في القاعدة.
-- حرّاس requireRole في Next.js حقيقيون — لكن لكل موظف مفتاح قاعدة بيانات في
-- كوكي يقرؤه جافاسكربت، فيفتح أدوات المطوّر ويستدعي القاعدة مباشرة متجاوزاً
-- التطبيق كلّه. وأغلب الدوال كانت تسأل «هل أنت موظف؟» لا «هل أنت كاشير؟».

-- ═══ ١. من أنت، لا مجرّد: هل أنت موظف ═══

create or replace function public.is_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from employees e join roles r on r.id = e.role_id
    where e.auth_user_id = auth.uid() and e.is_active
      and (r.name_en = 'admin' or r.name_en = any(p_roles))
  );
$fn$;

-- الموظف الحالي — للتحقق من الملكية.
create or replace function public.me_employee()
returns uuid language sql stable security definer set search_path = public as $fn$
  select id from employees where auth_user_id = auth.uid() and is_active limit 1;
$fn$;

grant execute on function public.is_role(text[]) to authenticated;
grant execute on function public.me_employee() to authenticated;

-- ═══ ٢. الدفع: دور الكاشير + خصم مقصوص + يوم العمل ═══

create or replace function public.mark_order_paid(
  p_order uuid, p_discount integer default 0, p_customer uuid default null,
  p_award_points integer default 0, p_extra integer default 0, p_extra_note text default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_seq int; v_cust uuid; v_sub int; v_disc int;
begin
  -- كان is_staff(): عامل التنظيف يستطيع تصفير أي فاتورة من أدوات المطوّر
  if not public.is_role('cashier') then raise exception 'not authorized'; end if;

  select subtotal into v_sub from orders where id = p_order and status = 'pending';
  if v_sub is null then raise exception 'order not pending'; end if;

  -- الخصم لا يتجاوز المجموع.
  --
  -- كان القيد الوحيد discount >= 0 بلا سقف، فطلب بـ٣٬٠٠٠ يقبل خصم ٥٬٠٠٠،
  -- وصافيه السالب يدخل تقرير الوردية فيُنقص النقد المتوقَّع — فيظهر الصندوق
  -- بفائض، ولا أحد يحقّق في فائض. وزر «استبدال» يضيف للخصم بلا سقف.
  v_disc := least(greatest(0, coalesce(p_discount, 0)), v_sub);

  update orders set
    status = 'paid', paid_at = now(),
    discount = v_disc,
    extra = greatest(0, coalesce(p_extra, 0)),
    extra_note = nullif(trim(coalesce(p_extra_note, '')), ''),
    customer_id = coalesce(p_customer, customer_id),
    -- يوم العمل يتبع النقد لا الطلب: طلب ٢٣:٥٢ يُدفع ٠٠:٠٦ كان نقده في درج
    -- اليوم ومبيعته في أمس، فيختلف تقرير الوردية عن تقرير اليوم بالضرورة.
    business_day = (now() at time zone 'Asia/Baghdad')::date
    where id = p_order and status = 'pending'
    returning order_seq, customer_id into v_seq, v_cust;
  if not found then raise exception 'order not pending'; end if;

  if v_cust is not null and coalesce(p_award_points, 0) > 0 then
    insert into loyalty_events(customer_id, order_id, delta, reason)
      values (v_cust, p_order, p_award_points, 'earn_order')
      on conflict (order_id) where reason = 'earn_order' do nothing;
  end if;
  return v_seq;
end $fn$;

-- ═══ ٣. الورديات: ملكيّة، لا مجرّد وظيفة ═══

create or replace function public.session_report(p_session uuid)
returns table(opening_float integer, cash_sales integer, card_sales integer, orders_count integer,
              expenses_total integer, deposited integer, debts_issued integer, expected_cash integer)
language plpgsql stable security definer set search_path = public as $fn$
declare v_s public.cashier_sessions;
begin
  select * into v_s from cashier_sessions where id = p_session;
  if not found then raise exception 'unknown session'; end if;
  -- تقرير وردية غيرك ليس من شأنك — إلا أن تكون المدير
  if v_s.cashier_id is distinct from public.me_employee() and not public.is_admin() then
    raise exception 'not your session';
  end if;

  select
    v_s.opening_float,
    coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.payment_method = 'cash'), 0)::int,
    coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.payment_method = 'card'), 0)::int,
    count(o.id)::int
  into opening_float, cash_sales, card_sales, orders_count
  from orders o where o.session_id = p_session and o.status = 'paid';

  select coalesce(sum(e.amount), 0)::int into expenses_total from expenses e where e.session_id = p_session;
  select coalesce(sum(d.amount) filter (where d.kind = 'debit'), 0)::int into debts_issued
    from debt_entries d where d.session_id = p_session;

  deposited := v_s.deposited;
  expected_cash := opening_float + cash_sales - expenses_total - v_s.deposited;
  return next;
end $fn$;

create or replace function public.close_cashier_session(
  p_session uuid, p_counted integer, p_deposited integer default 0,
  p_handover_to uuid default null, p_note text default null)
returns table(expected_cash integer, variance integer)
language plpgsql security definer set search_path = public as $fn$
declare v_rep record; v_expected int; v_counted int; v_deposited int; v_owner uuid;
begin
  select cashier_id into v_owner from cashier_sessions where id = p_session;
  if v_owner is null then raise exception 'unknown session'; end if;
  -- كان is_staff(): أي موظف يستطيع إقفال درج كاشير آخر برقم مُلفَّق، فيُجمّد
  -- عجزاً باسم شخص لم يعدّ شيئاً
  if v_owner is distinct from public.me_employee() and not public.is_admin() then
    raise exception 'not your session';
  end if;

  v_counted   := greatest(0, coalesce(p_counted, 0));
  v_deposited := greatest(0, coalesce(p_deposited, 0));

  if exists (select 1 from cashier_sessions where id = p_session and closed_at is not null) then
    raise exception 'already closed';
  end if;

  update cashier_sessions set deposited = v_deposited where id = p_session;
  select * into v_rep from public.session_report(p_session);
  v_expected := v_rep.expected_cash;

  update cashier_sessions
     set closed_at = now(), counted_cash = v_counted, expected_cash = v_expected,
         variance = v_counted - v_expected,
         close_note = nullif(trim(coalesce(p_note, '')), ''),
         handover_to = p_handover_to,
         handover_amount = greatest(0, v_counted - v_deposited)
   where id = p_session;

  return query select v_expected, v_counted - v_expected;
end $fn$;

-- ═══ ٤. النقاط: بلا حدّ كانت، ولأي موظف ═══

create or replace function public.adjust_points(p_customer uuid, p_delta integer, p_reason text, p_key text default null)
returns integer language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_role('cashier') then raise exception 'not authorized'; end if;
  insert into loyalty_events(customer_id, delta, reason, idempotency_key)
    values (p_customer, p_delta, coalesce(p_reason, 'manual_adjust'), p_key)
    on conflict (idempotency_key) do nothing;
  return (select points from customers where id = p_customer);
end $fn$;

-- ═══ ٥. وردية واحدة للمحل، لا لكل كاشير ═══
--
-- الفهرس كان on cashier_sessions(cashier_id) where closed_at is null — أي
-- وردية واحدة لكل شخص. فيفتح أحمد بـ٥٠٬٠٠٠ ويفتح مصطفى على الدرج نفسه
-- بـ٥٠٬٠٠٠، والدرج فيه ٥٠٬٠٠٠ ⇒ من يعدّ ثانياً يظهر بعجز افتتاحيّ غيره.
drop index if exists cashier_sessions_one_open;
create unique index if not exists cashier_sessions_one_open_shop
  on public.cashier_sessions ((true)) where closed_at is null;

-- ═══ ٦. إشعار المتصل: الاشتراك اللحظي كان ميتاً ═══
--
-- 0047 فعّل RLS وسحب الصلاحيات ولم ينشئ أي سياسة؛ ثم أضاف 0053 الجدول إلى
-- supabase_realtime. والبث اللحظي يطبّق RLS على كل مشترك — فالقناة تشترك
-- بنجاح ولا يصلها حدث أبداً. الاسم كان يصل بالاستطلاع (٤ ثوانٍ)، وهو بالضبط
-- التأخير الذي كُتب 0053 ليزيله.
grant select on public.incoming_calls to authenticated;
drop policy if exists calls_staff_read on public.incoming_calls;
create policy calls_staff_read on public.incoming_calls
  for select to authenticated using (public.is_staff());

-- ═══ ٧. الزبائن: الاسم والنقاط نعم، الهاتف والعنوان لا ═══
--
-- كان grant select بلا قائمة أعمدة، فشمل address الذي أضافه 0047 بعده. وأي
-- موظف يقرأ قائمة زبائنك كاملة بأرقامهم وعناوينهم من أدوات المطوّر، رغم أن
-- listCustomers في التطبيق محروسة بـrequireAdmin.
revoke select on public.customers from authenticated;
grant select (id, card_serial, name_ar, points, created_at) on public.customers to authenticated;

-- ═══ ٨. التسوية مرّتين ═══
create unique index if not exists partner_settlements_once
  on public.partner_settlements (partner_id, business_day, amount, method);

-- ═══ ٩. سجلّ التشخيص: عشرون سطراً عالمياً كانت تُمحى قبل أن تُقرأ ═══
create or replace function public.log_webhook(p_route text, p_status int, p_body text, p_note text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  insert into webhook_log(route, status, body, note) values (p_route, p_status, left(p_body, 600), p_note);
  -- بحسب المسار لا عالمياً: مسار مزدحم كان يمحو أدلّة مسار آخر خلال دقائق
  delete from webhook_log where id in (
    select id from (
      select id, row_number() over (partition by route order by id desc) rn from webhook_log
    ) t where t.rn > 40
  );
end $fn$;
