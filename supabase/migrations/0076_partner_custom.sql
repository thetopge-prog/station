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

-- زاد تحديداً، كما طُلب. بالاسم لأن المعرّف يختلف بين البيئات.
update public.delivery_partners set settlement = 'custom', commission_pct = 0
 where lower(trim(name_ar)) in ('زاد', 'zad');

notify pgrst, 'reload schema';
