-- ═══ شركة «مخصّص»: لا ذمّة ولا عمولة ثابتة ═══
--
-- زاد لا تُعامَل كحساب يُقيَّد ويُسوَّى، ولا بنسبة ثابتة: المندوب يدفع ما
-- يدفعه في كل طلب، والكاشير يكتب المبلغ لحظتها. ما دُفع يدخل الدرج، والفرق
-- يُسجَّل عمولةً على ذلك الطلب وحده، ولا يظهر شيء في كشف الذمم.
--
-- لا يلزم عمود جديد: partner_cash_received/partner_commission (0068) يحملان
-- الرقمين، وكشف الذمم يستثني أصلاً كل طلب فيه partner_cash_received.

alter table public.delivery_partners drop constraint if exists delivery_partners_settlement_check;
alter table public.delivery_partners
  add constraint delivery_partners_settlement_check
  check (settlement in ('credit', 'cash_at_pickup', 'custom'));

-- ── «تعذّر الحفظ» في شاشة الشركات منذ 0054 ─────────────────────────────────
-- 0054 أضاف save_partner بثماني وسائط ولم يُسقط ذات الخمس، فصار للاسم
-- تعريفان وPostgREST يرفض الاختيار بينهما: «Could not choose the best
-- candidate function». كل حفظ وتعديل وتعطيل من الشاشة كان يفشل بهذه الرسالة
-- المخفيّة خلف «حاول مجدداً». يبقى تعريف واحد.
drop function if exists public.save_partner(uuid, text, text, boolean, text);

-- زاد تحديداً، كما طُلب. بالاسم لأن المعرّف يختلف بين البيئات.
update public.delivery_partners set settlement = 'custom', commission_pct = 0
 where lower(trim(name_ar)) in ('زاد', 'zad');

notify pgrst, 'reload schema';
