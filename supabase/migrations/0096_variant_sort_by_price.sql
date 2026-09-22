-- 0096: ترتيب الأحجام بالسعر — الأرخص أولاً.
--
-- خمسة أصناف (بركر دجاج بالجبن، زنجر بالجبن، تويستر، فلر، بيتزا دجاج
-- الباربيكيو) حجماها بترتيب واحد (sort=0)، فصار «أوّل صفّ» هو «وجبة»/«كبير»:
-- من طلب الصنف وحده سُجّل له الأغلى. الكود صار يختار الأرخص، وهذا يجعل
-- الترتيب المعروض متّفقاً معه.
with ranked as (
  select v.id, row_number() over (
           partition by v.item_id
           order by coalesce(v.price_override, i.price) asc, v.name_ar
         ) as rn
    from public.item_variants v
    join public.menu_items i on i.id = v.item_id
   where v.kind = 'size'
)
update public.item_variants v set sort = r.rn
  from ranked r
 where v.id = r.id and v.sort is distinct from r.rn;
