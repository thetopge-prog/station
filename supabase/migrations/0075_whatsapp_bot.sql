-- ═══ طلبات الزبائن من واتساب ═══
--
-- نفس محرّك بوت تليغرام حرفاً بحرف — الفرق كلّه في العرض: واتساب لا يعرف
-- «الأزرار المضمَّنة» بل رسالة تفاعلية بثلاثة أزرار أو قائمة بعشرة صفوف.
--
-- ويبقى شيء واحد في القاعدة: رقم الزبون على واتساب (wa_id) ليُبلَّغ حين يُقبل
-- طلبه ويجهز — كما فعلنا لتليغرام في 0066. المصدر 'whatsapp' مسموح أصلاً في
-- القيد ولا يحتاج توسيعاً.

alter table public.orders add column if not exists whatsapp_wa_id text;

-- يُقرأ من عميل الخدمة وحده؛ رقم الزبون ليس للعموم
revoke select (whatsapp_wa_id) on public.orders from anon, authenticated;

notify pgrst, 'reload schema';
