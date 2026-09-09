-- ═══ الطابعة تتبع الطلب لا الجهاز ═══
--
-- الطباعة كانت تخرج من متصفح الجهاز الذي أُدخل منه الطلب إلى وكيل الطباعة
-- على حاسوب الكاشير وحده. طلب من موبايل الكاشير أو من البوت يُحفظ ويظهر على
-- الشاشات ولا تخرج له ورقة. الآن: كل طلب مدفوع يحمل «طُبع في»، وحاسوب
-- الكاشير يلتقط ما لم يُطبع ويطبعه. الادّعاء ذرّي (update … where printed_at
-- is null) فلا يطبع جهازان الورقة نفسها.

alter table public.orders add column if not exists printed_at timestamptz;
create index if not exists orders_unprinted_paid on public.orders(paid_at) where status = 'paid' and printed_at is null;

-- ما طُبع قبل هذا الترحيل لا يُعاد طبعه
update public.orders set printed_at = coalesce(paid_at, created_at) where status = 'paid' and printed_at is null;

notify pgrst, 'reload schema';
