-- البيجر الرقمي: هاتف الزبون يرنّ لحظة يجهز طلبه.
--
-- الزبون يمسح رمزاً على إيصاله، فتُسجَّل نافذة الإشعارات الخاصّة بجهازه مربوطةً
-- **بطلبٍ واحد**. وحين يعلّمه المجهّز جاهزاً، يصل التنبيه ويُحذف الصفّ.
--
-- ولا جدول جديد: `push_subscriptions` موجود منذ 0010 لأجهزة الموظفين، وكل ما
-- ينقصه عمودٌ يقول «لمن هذا الجهاز». فارغٌ = موظّف كما كان، ومملوءٌ = بيجر.
--
-- ⚠ وشرطٌ في `push.ts` يرافق هذا الترحيل ولا ينفصل عنه: إرسال «طلب جديد»
-- للموظفين صار يُرشِّح `order_id is null`. وبدونه يرنّ هاتفُ الزبون بكل طلبٍ
-- يدخل المحل.

alter table public.push_subscriptions
  add column if not exists order_id uuid references public.orders(id) on delete cascade;

create index if not exists push_subs_order_idx on public.push_subscriptions(order_id);

comment on column public.push_subscriptions.order_id is
  'فارغ = جهاز موظّف (تنبيه الطلبات الجديدة). مملوء = بيجر زبونٍ لطلبٍ واحد.';

/**
 * اشتراك جهاز الزبون ببيجر طلبه.
 *
 * يُنادى من صفحةٍ عامّة بلا حساب، فكل الحراسة هنا:
 *
 *   • **المعرّف هو الإذن** — من يملك uuid الطلب يملك الطلب، وهو نفس ما تقوم
 *     عليه `cancel_my_order` و`park_my_order` منذ 0088.
 *   • **اليوم وحده** — رابطٌ قديم لا يفتح بيجراً على طلبٍ مضى.
 *   • **وطلبٌ حيّ** — لا اشتراك على مُسلَّمٍ ولا ملغى: لا شيء سيُرسَل بعدهما.
 *   • **وثلاثة أجهزة للطلب** — مسحٌ متكرّر لا يملأ الجدول.
 *
 * وتعيد نصّاً يقول ماذا جرى، فالصفحة تعرف ما تقول للزبون بدل «فشل».
 */
create or replace function public.pager_subscribe(
  p_order uuid, p_endpoint text, p_p256dh text, p_auth text
) returns text language plpgsql security definer set search_path = public as $$
declare v_day date; v_prep text; v_status text; v_n int;
begin
  if coalesce(btrim(p_endpoint), '') = '' or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = '' then
    return 'bad';
  end if;

  select business_day, prep_status::text, status::text
    into v_day, v_prep, v_status
    from orders where id = p_order;
  if v_day is null then return 'gone'; end if;
  if v_day <> public.business_day_of(now()) then return 'old'; end if;
  if v_status = 'cancelled' then return 'cancelled'; end if;
  if v_prep = 'handed' then return 'done'; end if;

  -- السقف يُحسب على الأجهزة الأخرى: إعادة اشتراك نفس الجهاز ليست جهازاً رابعاً
  select count(*) into v_n from push_subscriptions
    where order_id = p_order and endpoint <> p_endpoint;
  if v_n >= 3 then return 'full'; end if;

  insert into push_subscriptions (endpoint, p256dh, auth, order_id)
    values (btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth), p_order)
    on conflict (endpoint) do update
      set p256dh = excluded.p256dh, auth = excluded.auth, order_id = excluded.order_id;
  return 'ok';
end $$;

revoke all on function public.pager_subscribe(uuid, text, text, text) from public;
grant execute on function public.pager_subscribe(uuid, text, text, text) to anon, authenticated;

-- ── رمز الاستلام للزبون ────────────────────────────────────────────────
--
-- صفحة المتابعة تعرض رقم الطلب ورمز استلامه — وبهما يستلم من الكاونتر. ومن
-- يملك uuid الطلب يملكهما أصلاً، فلا يُكشف بهذا شيءٌ جديد.
--
-- وإضافة حقلٍ إلى jsonb متوافقة مع كل منادٍ قائم: `MenuClient` يقرأ ما يعرفه
-- ويتجاهل ما لا يعرفه.
create or replace function public.get_orders_public(p_orders uuid[])
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id,
      'order_seq', o.order_seq,
      'pickup_code', o.pickup_code,
      'status', o.status,
      'prep_status', o.prep_status,
      'table_no', o.table_no,
      -- الطريقة: صفحة البيجر تقول لزبون السيارة «الساعي طالع إلك» لا
      -- «استلمه من الكاونتر» — وهو جالسٌ بسيارته ينتظر
      'channel', o.channel,
      'subtotal', o.subtotal,
      'discount', o.discount,
      'created_at', o.created_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name_ar', i.name_ar, 'flavor_ar', i.flavor_ar,
          'qty', i.qty, 'unit_price', i.unit_price, 'line_total', i.line_total))
        from order_items i where i.order_id = o.id), '[]'::jsonb)
    ) as x
    from orders o where o.id = any(p_orders[1:20])
  ) t
$$;

grant execute on function public.get_orders_public(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
