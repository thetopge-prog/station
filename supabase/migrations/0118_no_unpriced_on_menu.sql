-- صنفٌ بلا سعر لا يُعرض على الزبون.
--
-- السبب: «بيتزا فري فيجي - وسط» أُنشئت في ٢٤ أيلول وسعرها صفر، فظهرت على
-- المنيو العامّ مكتوباً تحتها «مجاناً» — وبيعت مرّتين بصفر فعلاً قبل أن
-- يلحظها المالك.
--
-- و«مجاناً» ليست عطلاً: `item_offers.offer_price = 0` عرضٌ مجانيٌّ متعمّد
-- يضعه الموظف (`MenuClient.tsx:393`). العطل أن **السعر الأساسي** إذا كان
-- صفراً سقط في نفس المسار — فصنفٌ نُسي سعره صار عرضاً مجانياً.
--
-- والعلاج هنا لا في الواجهة: المنيو يُقرأ من هذين العرضين وحدهما، فالحارس
-- فيهما يحمي كل شاشةٍ تقرؤهما — الموقع والكشك والبوت معاً.
--
-- ⚠ وصنفٌ بلا سعر **يختفي** من المنيو ولا يُباع. وهذا مقصود: اختفاؤه يُلحَظ
-- ويُسأل عنه، وبيعُه بصفر لا يُلحظ إلا في الجرد. ويذكّر به التقريرُ الليلي.
--
-- ولا يُمسّ المنيو الإداري: المالك يرى الصنف ليضع سعره.

/**
 * هل لهذا الصنف سعرٌ يُباع به؟
 *
 * نعم إن كان سعره الأساسي موجباً، أو كان له خيارٌ فعّالٌ بسعرٍ موجب — فبعض
 * الأصناف كلّ سعرها في خياراتها («وسط/كبير»)، وحارسٌ يفحص الأساسيّ وحده
 * كان سيُخفيها.
 */
create or replace function public.item_is_priced(p_item uuid, p_price int)
returns boolean language sql stable set search_path = public as $$
  select coalesce(p_price, 0) > 0
      or exists (
        select 1 from item_variants v
         where v.item_id = p_item and v.is_active and coalesce(v.price_override, 0) > 0
      )
$$;

create or replace view public.menu_public as
  select mi.id, mi.category_id, mi.name_ar, mi.name_en, mi.description_ar, mi.description_en,
         mi.image_url, mi.price, mi.flavors, mi.sort,
         c.name_ar as category_name, c.name_en as category_name_en,
         c.image_url as category_image, c.sort as category_sort, c.late_cutoff as category_late_cutoff
  from public.menu_items mi
    join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active and not mi.student_only
    and public.item_is_priced(mi.id, mi.price);

create or replace view public.student_menu_public as
  select mi.id, mi.category_id, mi.name_ar, mi.name_en, mi.description_ar, mi.description_en,
         mi.image_url,
         coalesce(mi.student_price, mi.price) as price,
         mi.flavors, mi.sort, mi.student_only,
         c.name_ar as category_name, c.name_en as category_name_en,
         c.image_url as category_image, c.sort as category_sort, c.late_cutoff as category_late_cutoff
  from public.menu_items mi
    join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active
    -- سعر الطالب إن وُجد، وإلا الأساسيّ — والحارس على ما يُعرض فعلاً
    and public.item_is_priced(mi.id, coalesce(mi.student_price, mi.price));

grant select on public.student_menu_public, public.student_variant_public to anon, authenticated;
revoke insert, update, delete on public.student_menu_public from anon, authenticated;

notify pgrst, 'reload schema';
