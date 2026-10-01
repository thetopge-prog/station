-- «الحساب السابق» لشركات التوصيل — إظهارٌ منفصل، لا تصفير.
--
-- طلبت الإدارة إخفاء حركة ما قبل بداية المبيعات (0116) من الشاشة، وعرضها في
-- البوت لكل شركة على حدة.
--
-- ⚠ ولا يُمسّ `partner_balances`. رصيد الشركة حسابٌ جارٍ لا رقمُ مبيعات:
-- فوترةٌ ناقص تسديد. وقصّ الفوترة وحدها يُنقص الرصيد بمقدار كل ما فُوتر قبل
-- البداية، فينقلب سالباً وتقول الشاشة «دفعت زيادة» عن شركةٍ تدين لنا — وهو
-- خطأ لا يُكتشف إلا بخسارة. ويحرس ذلك اختبارٌ في sales-epoch.test.ts.
--
-- فهذه الدالّة تُضيف ولا تطرح: تُعيد ما قبل اليوم المعطى على جانبيه معاً
-- (الفوترة والتسديد)، فيبقى المحصّل صحيحاً:
--
--     رصيد سابق + فوترة الفترة − تسديد الفترة = الرصيد الجاري نفسه
--
-- وهي المتطابقة التي تجعل القصّ عرضاً لا فقداناً.

/**
 * حركة كل شركة قبل يومٍ معيَّن.
 *
 * والمرشِّحات منقولة من `partner_balances` (0091) حرفيّاً — `status='paid'`
 * و`partner_cash_received is null` — وإلا اختلف «السابق» عن «الجاري» في
 * تعريف ما يُعدّ ديناً، فلم تُغلق المتطابقة أعلاه.
 *
 * وبـ`business_day` لا `created_at`: اليوم يُقطع الرابعة فجراً، وطلبُ الواحدة
 * ليلاً يقع في يوم أمس. والتسديدات تحمل `business_day` أصلاً.
 */
create or replace function public.partner_opening(p_before date)
returns table (
  partner_id uuid,
  name_ar text,
  billed bigint,
  settled bigint,
  orders_count int,
  opening bigint
) language sql stable security definer set search_path = public as $$
  select p.id,
         p.name_ar,
         coalesce(o.billed, 0)::bigint,
         coalesce(s.settled, 0)::bigint,
         coalesce(o.orders_count, 0)::int,
         (coalesce(o.billed, 0) - coalesce(s.settled, 0))::bigint
    from delivery_partners p
    left join (
      select partner_id,
             sum(subtotal - discount + extra) as billed,
             count(*) as orders_count
        from orders
       where partner_id is not null
         and status = 'paid'
         and partner_cash_received is null
         and business_day < p_before
       group by partner_id
    ) o on o.partner_id = p.id
    left join (
      select partner_id, sum(amount) as settled
        from partner_settlements
       where business_day < p_before
       group by partner_id
    ) s on s.partner_id = p.id
   order by (coalesce(o.billed, 0) - coalesce(s.settled, 0)) desc, p.name_ar;
$$;

revoke all on function public.partner_opening(date) from public, anon, authenticated;
grant execute on function public.partner_opening(date) to service_role;

notify pgrst, 'reload schema';
