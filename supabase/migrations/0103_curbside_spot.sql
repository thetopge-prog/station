-- «وين طابك؟» — الزبون يقول أين وقف بعد وصوله.
--
-- مواقف المطعم لا تكفي دائماً، فالزبون يركن في الشارع الخلفي أو مقابل المحل
-- أو خلف سيّارةٍ أخرى — ووصفُ السيارة وحده لا يكفي الساعي ليجدها. فبعد أن
-- يصل، يكتب مكانه في سطر، ويظهر في ملاحظة الطلب حيث تظهر بقيّة تفاصيل
-- الاستلام أصلاً (وصف السيارة، طريقة الدفع) — بلا عمودٍ جديد ولا شاشة جديدة.
--
-- والمعرّف uuid هو الإذن، كما في cancel_my_order (0088): من يملك الرابط يملك
-- الطلب. ولا يُكتب المكان على طلبٍ أُلغي أو سُلّم — فالمكان حينها لا معنى له.
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

  -- يُستبدل السطر السابق إن كرّرها: الزبون ينتقل من موقفٍ إلى آخر وهو ينتظر،
  -- والأخير هو الصحيح. والفاصل ' · ' هو فاصل buildNote نفسه
  v_note := btrim(regexp_replace(coalesce(v_note, ''), '( · )?📍[^·]*', '', 'g'));
  update orders
     set note = nullif(btrim(concat_ws(' · ', nullif(v_note, ''), '📍 ' || v_spot)), '')
   where id = p_order;
  return 'saved';
end $$;

grant execute on function public.park_my_order(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
