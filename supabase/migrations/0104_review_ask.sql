-- طلب التقييم على خرائط جوجل — بعد التسليم بقليل، ولمن اختاره الكاشير.
--
-- التقييمات هي ما يصنع «أفضل مطعم» في بحث الخرائط، لا ما يُكتب في الموقع. وكان
-- النظام يسأل زبائن البوت عن درجةٍ من ١ إلى ١٠ (0095) وتبقى عنده — ولا يطلب من
-- أحدٍ تقييماً علنياً.
--
-- والطلب لا يُرسَل لكل زبون: الكاشير يؤشّر «+ تقييم كوكل» على الطلب وهو يبيع،
-- فهو الذي رأى الزبون وعرف إن كان راضياً. ورسالةٌ إلى زبونٍ غاضب تزيده غضباً.
alter table public.orders
  add column if not exists ask_review boolean not null default false,
  add column if not exists review_asked_at timestamptz,
  -- اسم القسم الذي تكرّر في آخر ثلاثة طلبات («كنتاكي»/«بيتزا») — تُبنى عليه
  -- رسالةٌ تسأل عن الصنف نفسه بدل رسالةٍ عامّة
  add column if not exists review_focus text;

-- نفس نمط orders_rating_due في 0095: فهرسٌ جزئيٌّ ضيّق يمرّ عليه الجدول كل خمس
-- دقائق، فلا يقرأ إلا الصفوف التي تنتظر فعلاً
create index if not exists orders_review_due
  on public.orders (handed_at)
  where ask_review and review_asked_at is null;

comment on column public.orders.ask_review is 'الكاشير أشّر أن يُطلب من هذا الزبون تقييم جوجل';
comment on column public.orders.review_asked_at is 'لحظة إرسال الطلب — تُختم قبل الإرسال فلا يُرسَل مرّتين';
comment on column public.orders.review_focus is 'القسم المتكرّر في آخر ٣ طلبات، أو null';

/*
 * القسم الذي تكرّر في الطلبات الثلاثة الأخيرة لنفس الزبون.
 *
 * من طلب الكنتاكي ثلاث مرّات من ثلاث يُسأل عن الكنتاكي بالاسم لا سؤالاً عامّاً —
 * والسؤال الذي يعرف ما أكلتَه يُجاب، والعامّ يُتجاهل.
 *
 * ويشترط الظهور في **الثلاثة كلّها**: مرّتان من ثلاث صدفة، وثلاثٌ من ثلاث عادة.
 * ويُقصر على قسمين اثنين — هما ما طلبه المالك، وما عداهما (مشروبات، صوصات)
 * يأتي تبعاً لا اختياراً فلا يدلّ على شيء.
 *
 * وصنفٌ حُذف من المنيو يفقد قسمه (`item_id` يصير null)، فيسقط الطلب من الحساب
 * بدل أن يُحسب بلا قسم — لأن غياب القسم ليس دليلاً على غيابه.
 */
create or replace function public.repeat_category(p_order uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_cust uuid; v_name text;
begin
  select customer_id into v_cust from orders where id = p_order;
  if v_cust is null then return null; end if;

  select c.name_ar into v_name
  from (
    select id from orders
     where customer_id = v_cust and status = 'paid'
     order by created_at desc
     limit 3
  ) last3
  join order_items i on i.order_id = last3.id
  join menu_items m on m.id = i.item_id
  join categories c on c.id = m.category_id
  where c.name_ar in ('كنتاكي', 'بيتزا')
  group by c.name_ar
  -- ظهر في ثلاثة طلباتٍ مختلفة، وكانت الطلبات ثلاثة
  having count(distinct last3.id) = 3
     and (select count(*) from (select id from orders where customer_id = v_cust and status = 'paid' order by created_at desc limit 3) x) = 3
  order by sum(i.qty) desc
  limit 1;

  return v_name;
end $$;

grant execute on function public.repeat_category(uuid) to service_role;

notify pgrst, 'reload schema';
