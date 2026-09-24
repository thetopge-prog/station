-- مادّة توقّع الطلبات: كم بِيع من كل صنف في كل يوم، وفي أي ساعة.
--
-- لا يوجد في النظام أي تجميعٍ للأصناف في SQL — بوت تيليغرام يجمعها في الذاكرة
-- بجلب كل صفوف order_items صفحةً صفحة. ولا يوجد تجميعٌ بالساعة إطلاقاً.
-- وبلا الاثنين لا يُعرف «كم كنتاكي أجهّز اليوم، وقبل أي ساعة».
--
-- الحساب نفسه في TypeScript (src/lib/cafe/prep-forecast.ts) لا هنا: هو الذي
-- يُختبَر بلا قاعدة، وهذه تعطيه المادّة الخام لا الرأي.

/*
 * المبيع لكل صنفٍ في كل يوم عمل.
 *
 * الاسم من المنيو إن كان الصنف حيّاً، وإلا من اللقطة المحفوظة في السطر —
 * فصنفٌ حُذف من المنيو لا يختفي من التاريخ. وقسمه يضيع حينها (`item_id` يصير
 * null) فيُسمّى «—»، والحساب يُسقطه.
 */
create or replace function public.sales_by_item_day(p_from date, p_to date)
returns table(day date, item_id uuid, name_ar text, category_name text, qty int)
language sql stable security definer set search_path = public as $$
  select o.business_day,
         i.item_id,
         coalesce(m.name_ar, i.name_ar),
         coalesce(c.name_ar, '—'),
         sum(i.qty)::int
    from orders o
    join order_items i on i.order_id = o.id
    left join menu_items m on m.id = i.item_id
    left join categories c on c.id = m.category_id
   where o.status = 'paid'
     and o.business_day between p_from and p_to
   group by 1, 2, 3, 4;
$$;

/*
 * شكل اليوم: المبيع لكل قسمٍ في كل ساعة.
 *
 * **بساعة بغداد لا بساعة الخادم** — الرقم يُقرأ ليُجدوَل عليه الطبّاخون، وساعةٌ
 * مزاحة تعني تجهيزاً في الوقت الخطأ.
 *
 * وبالقسم لا بالصنف: منحنى الساعات خاصّيّةُ القسم (الكنتاكي يذروة ليلاً
 * والبيتزا أبكر)، وستة عشر يوماً لا تكفي لمنحنىً لكل صنفٍ على حدة — فتُقسَّم
 * كمّيةُ الصنف على منحنى قسمه.
 */
create or replace function public.sales_by_hour(p_from date, p_to date)
returns table(hr int, category_name text, qty int)
language sql stable security definer set search_path = public as $$
  select extract(hour from (o.created_at at time zone 'Asia/Baghdad'))::int,
         coalesce(c.name_ar, '—'),
         sum(i.qty)::int
    from orders o
    join order_items i on i.order_id = o.id
    left join menu_items m on m.id = i.item_id
    left join categories c on c.id = m.category_id
   where o.status = 'paid'
     and o.business_day between p_from and p_to
   group by 1, 2;
$$;

-- نفس نمط range_summary: الخادم وحده. وهي أرقام مبيعات، ولا تُقرأ من متصفّح
revoke all on function public.sales_by_item_day(date, date) from anon, authenticated;
revoke all on function public.sales_by_hour(date, date) from anon, authenticated;
grant execute on function public.sales_by_item_day(date, date) to service_role;
grant execute on function public.sales_by_hour(date, date) to service_role;

notify pgrst, 'reload schema';
