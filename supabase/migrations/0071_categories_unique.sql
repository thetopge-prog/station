-- ═══ اسم القسم فريد ═══
--
-- «مشروبات» أُدرج مرّتين بفارق ثانيتين: ضغطتان على «+ قسم» بلا ردّ من الشاشة.
-- شاشة الكاشير تُميّز الأقسام بالاسم، فالقسم المكرّر لا يُختار ويُربك القائمة.
-- الدمج هنا ثم قيد في القاعدة: الضغطة الثانية تُرفض ولو جاءت من جهاز آخر.

do $$
declare
  d record;
  keeper uuid;
  rest uuid[];
begin
  for d in
    select lower(trim(name_ar)) as key, array_agg(id order by created_at, id) as ids
      from public.categories
     group by 1
    having count(*) > 1
  loop
    keeper := d.ids[1];
    rest := d.ids[2:];
    -- الأصناف أولاً: المفتاح on delete restrict
    update public.menu_items set category_id = keeper where category_id = any(rest);
    -- لا تفقد محطة الطبخ إن كانت على النسخة الأحدث وحدها
    update public.categories c
       set station_id = coalesce(c.station_id, (select station_id from public.categories where id = any(rest) and station_id is not null limit 1))
     where c.id = keeper;
    delete from public.categories where id = any(rest);
  end loop;
end $$;

create unique index if not exists categories_name_uniq on public.categories (lower(trim(name_ar)));

notify pgrst, 'reload schema';
