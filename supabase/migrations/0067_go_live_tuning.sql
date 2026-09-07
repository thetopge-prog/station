-- ═══ أول ليلة عمل — ثلاثة تعديلات من الكاونتر ═══

-- ١. تذكرة المطبخ تحمل كل الأصناف، وتخرج من الطابعة رقم ٣ (POS-24).
--    تذكرة التجهيز هي أصلاً «كل الأصناف بلا مال» — فبدل ثلاث تذاكر لثلاث
--    محطات، تُوجَّه هي إلى طابعة المطبخ. صفوف المحطات تبقى مطفأة.
update public.printers set share = 'POS-24', host = null, is_active = true, updated_at = now()
 where kind = 'expediter';
update public.printers set is_active = false where kind = 'station';

-- ٢. كنتاكي أول الأقسام على الكاشير.
update public.categories set sort = 0 where name_ar = 'كنتاكي';

-- ٣. العجينة: سميك أولاً — والكاشير والبوت يختاران الأول تلقائياً.
update public.menu_items i set flavors = '{سميك,خفيف}'::text[]
  from public.categories c
 where c.id = i.category_id and c.name_ar = 'بيتزا';

notify pgrst, 'reload schema';
