-- إصلاح عاجل: المنيو العامّ سقط فارغاً بعد 0118.
--
-- `item_is_priced` تقرأ `item_variants`، وذلك الجدول **محجوب عن anon** (0002).
-- والدالّة كُتبت بلا `security definer`، فصارت تُنفَّذ بصلاحية الزبون — ففشلت
-- بـ«permission denied»، وفشلُها أسقط صفوف `menu_public` كلّها. أي أن حارساً
-- وُضع ليمنع صنفاً واحداً منع الأصناف جميعاً.
--
-- والعلاج: تُنفَّذ بصلاحية مالكها كبقيّة دوالّ القراءة العامّة في المشروع.
-- وهي قراءةٌ محضة لعمودٍ واحد (هل السعر موجب؟) ولا تكشف شيئاً: الزبون يرى
-- أسعار الخيارات أصلاً في `variant_public`.
--
-- والدرس المكتوب لمن يأتي بعدُ: **كل دالّة تُنادى من عرضٍ عامّ تُجرَّب بدور
-- anon لا بدور المالك.** التجربة كمالكٍ تنجح دائماً وتخفي هذا بالضبط.

create or replace function public.item_is_priced(p_item uuid, p_price int)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_price, 0) > 0
      or exists (
        select 1 from item_variants v
         where v.item_id = p_item and v.is_active and coalesce(v.price_override, 0) > 0
      )
$$;

grant execute on function public.item_is_priced(uuid, int) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
