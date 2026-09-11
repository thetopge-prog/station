-- ═══ المطبخ يطبع ما يُطبخ فقط ═══
--
-- الصورة حسمت الأسماء: POS80 طابعة الكاونتر، POS-24 طابعة المطبخ. المالك يريد:
--   الكاونتر: وصل الزبون + تذكرة التجهيز (كل الأصناف، بالباركود).
--   المطبخ:   تذكرة واحدة فيها بيتزا/برجر/زنجر فقط — لا كنتاكي ولا ريزو ولا
--             فرايز/فنكر ولا مشروبات.
--
-- التوجيه لا يتغيّر (print-routing.ts): تذكرة المحطة تحمل أصناف محطتها وحدها.
-- فمحطة واحدة «المطبخ» لما يُطبخ، ومحطة «الكاونتر» بلا طابعة لكنتاكي وفرايز —
-- بلا محطة كانت ستُعلَن «لا توجد محطة لـ…» على الكاشير مع كل طلب. الصوصات
-- والمشروبات تبقى بلا محطة كما كانت.

insert into public.stations(name_ar, name_en, sort)
values ('المطبخ', 'kitchen', 1), ('الكاونتر', 'counter', 2)
on conflict (name_en) do nothing;

update public.stations set is_active = false where name_en in ('grill', 'pizza_oven', 'burger');

update public.categories set station_id = (select id from public.stations where name_en = 'kitchen')
 where name_ar in ('بيتزا', 'برجر', 'زنجر');
update public.categories set station_id = (select id from public.stations where name_en = 'counter')
 where name_ar in ('كنتاكي', 'فرايز');

-- طابعة المطبخ: صفّ «فرن البيتزا» (share POS-24) يصير «المطبخ»
update public.printers
   set name_ar = 'المطبخ', station_id = (select id from public.stations where name_en = 'kitchen'),
       is_active = true, updated_at = now()
 where kind = 'station' and share = 'POS-24';

-- تذكرة التجهيز إلى الكاونتر، مع الوصل
update public.printers
   set share = 'POS80', name_ar = 'تذكرة التجهيز — طابعة الكاشير', updated_at = now()
 where kind = 'expediter' and is_active;
