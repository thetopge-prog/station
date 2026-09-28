-- «نجهّزه على ميز؟ أو سفري؟» — الزبون يقول كيف يريد طلبه بعد أن يؤكّده.
--
-- من يطلب من داخل المطعم عبر ‎/order‎ كان يُعامَل استلاماً: يُلفّ في كيسٍ
-- ويُسلَّم على الكاونتر. ومنهم من جاء ليجلس — فيقف ومعه كيسٌ يفكّه على طاولة.
-- سؤالٌ واحد بعد التأكيد يحسمها: يُقدَّم على صحنٍ على الطاولة، أو يُعبَّأ سفري.
--
-- ويصل في وقته: طلب الزبون يبقى «قيد الانتظار» حتى يقبله الكاشير، والتذاكر
-- تُطبع عند القبول لا عند الإرسال. فالاختيار الذي يصل بعد ثوانٍ من التأكيد
-- يسبق الورقة والمطبخ معاً.
--
-- ويُكتب في ملاحظة الطلب — حيث تظهر بقيّة تفاصيل الاستلام أصلاً — فيبلغ كل
-- شاشةٍ وكل تذكرةٍ تعرض الملاحظات، بلا عمودٍ جديد ولا شاشة. نفس نمط
-- park_my_order (0103)، والمعرّف uuid هو الإذن كما في cancel_my_order (0088).
create or replace function public.serve_my_order(p_order uuid, p_table boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_note text; v_tag text;
begin
  if p_table is null then return 'empty'; end if;
  v_tag := case when p_table then '🍽 على ميز' else '🥡 سفري' end;

  select status::text, note into v_status, v_note from orders where id = p_order;
  if v_status is null then return 'gone'; end if;
  if v_status = 'cancelled' then return 'gone'; end if;

  -- يُستبدل اختياره السابق إن بدّل رأيه — والأخير هو الصحيح. والفاصل ' · '
  -- هو فاصل buildNote نفسه
  v_note := btrim(regexp_replace(coalesce(v_note, ''), '( · )?(🍽|🥡)[^·]*', '', 'g'));
  update orders
     set note = nullif(btrim(concat_ws(' · ', nullif(v_note, ''), v_tag)), '')
   where id = p_order;
  return 'saved';
end $$;

grant execute on function public.serve_my_order(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
