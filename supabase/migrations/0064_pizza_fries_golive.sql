-- ═══ الاعتماد الليلة: المنيو كما يريده صاحب المحل ═══
--
-- بيانات فقط. الكاشير والمنيو يقرآن المتغيّرات والنكهات من القاعدة، فلا
-- سطر شيفرة يتغيّر هنا.

-- ── ١. البيتزا: الأحجام «وسط / كبير» على كل صنف عدا ليمو المتر ─────────────
--
-- الواقع قبل هذا: خمسة أصناف بـ«منفرد / وجبة ١٧٬٠٠٠» — وهي أحجام سُمّيت
-- تسمية الوجبات خطأً — والباربيكيو وحده بـ«وسط / كبير». التسمية تتوحّد،
-- والأسعار كما هي: وسط = سعر الصنف (١٢٬٠٠٠)، كبير = ١٧٬٠٠٠.
update public.item_variants v
   set name_ar = 'وسط', price_override = null
  from public.menu_items i
  join public.categories c on c.id = i.category_id
 where v.item_id = i.id and c.name_ar = 'بيتزا'
   and v.kind = 'size' and v.name_ar = 'منفرد';

update public.item_variants v
   set name_ar = 'كبير', price_override = 17000
  from public.menu_items i
  join public.categories c on c.id = i.category_id
 where v.item_id = i.id and c.name_ar = 'بيتزا'
   and v.kind = 'size' and v.name_ar = 'وجبة';

-- ── ٢. العجينة: «خفيف / سميك» فقط، على أصناف البيتزا كلها ───────────────────
--
-- «محشية الأطراف» تُحذف بقرار صاحب المحل. النكهات خيار بلا سعر، فلا
-- يتأثّر رقم.
update public.menu_items i
   set flavors = '{خفيف,سميك}'::text[]
  from public.categories c
 where c.id = i.category_id and c.name_ar = 'بيتزا';

-- ── ٣. فرايس → فرايز ────────────────────────────────────────────────────────
update public.categories set name_ar = 'فرايز' where name_ar = 'فرايس';
update public.printers   set name_ar = replace(name_ar, 'فرايس', 'فرايز') where name_ar like '%فرايس%';
update public.stations   set name_ar = replace(name_ar, 'فرايس', 'فرايز') where name_ar like '%فرايس%';

notify pgrst, 'reload schema';
