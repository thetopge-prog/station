-- تجريد وسمٍ من ملاحظة الطلب بلا أن يبقى فاصلٌ معلَّق.
--
-- الوسوم تُستبدل لا تُكرَّر: الزبون ينتقل من موقفٍ إلى آخر (📍)، أو يبدّل بين
-- الميز والسفري (🍽/🥡). وكان التجريد بتعبيرٍ نمطي يبتلع الفاصل **قبل** الوسم
-- ويترك الذي بعده:
--
--   'توصيل · 📍 كدام · بدون بصل'  ←  'توصيل· بدون بصل'
--
-- فيلتصق ما قبله بالفاصل، وتُطبع على التذكرة ملاحظةٌ مكسورة. ولا يظهر العطل
-- إلا إذا تلا الوسمَ مقطعٌ آخر — وهو ما يقع حين يعدّل الكاشير الملاحظة بعد
-- الزبون، أو حين يجتمع وسمان.
--
-- والعلاج أن تُعامَل الملاحظة كما هي: مقاطعُ يفصلها ' · '. تُقطَّع، ويُسقَط
-- المقطع الموسوم، ويُعاد الجمع بالفاصل نفسه — فلا فاصل يبقى بلا طرفين.

create or replace function public.strip_note_tag(p_note text, p_tags text)
returns text language sql immutable set search_path = public as $$
  select nullif(
    btrim(coalesce(
      (select string_agg(part, ' · ' order by ord)
         from unnest(string_to_array(coalesce(p_note, ''), ' · ')) with ordinality as t(part, ord)
        where btrim(part) <> '' and btrim(part) !~ p_tags),
      '')),
    '')
$$;

comment on function public.strip_note_tag(text, text) is
  'تُسقط من ملاحظة الطلب كل مقطعٍ يبدأ بأحد الوسوم، وتعيد الجمع بلا فاصلٍ معلَّق.';

-- ‹1› اختيار التقديم: على ميز أو سفري (0108)
create or replace function public.serve_my_order(p_order uuid, p_table boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_note text; v_tag text;
begin
  if p_table is null then return 'empty'; end if;
  v_tag := case when p_table then '🍽 على ميز' else '🥡 سفري' end;

  select status::text, note into v_status, v_note from orders where id = p_order;
  if v_status is null then return 'gone'; end if;
  if v_status = 'cancelled' then return 'gone'; end if;

  update orders
     set note = nullif(btrim(concat_ws(' · ', strip_note_tag(v_note, '^(🍽|🥡)'), v_tag)), '')
   where id = p_order;
  return 'saved';
end $$;

grant execute on function public.serve_my_order(uuid, boolean) to anon, authenticated;

-- ‹2› ونفس العطل في «وين طابك؟» (0103) — يُصلَح حيث هو لا حيث ظهر
create or replace function public.park_my_order(p_order uuid, p_spot text)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_note text; v_spot text;
begin
  v_spot := nullif(btrim(p_spot), '');
  if v_spot is null then return 'empty'; end if;
  -- حدٌّ على الطول: الحقل يُطبع على تذكرة عرضها ٨٠مم
  v_spot := left(v_spot, 120);

  select status::text, note into v_status, v_note from orders where id = p_order;
  if v_status is null then return 'gone'; end if;
  if v_status = 'cancelled' then return 'gone'; end if;

  update orders
     set note = nullif(btrim(concat_ws(' · ', strip_note_tag(v_note, '^📍'), '📍 ' || v_spot)), '')
   where id = p_order;
  return 'saved';
end $$;

grant execute on function public.park_my_order(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
