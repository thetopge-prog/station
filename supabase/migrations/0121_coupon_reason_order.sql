-- الطلب الذي سبّب التعويض.
--
-- وضّحت الإدارة الحالة الحقيقية: الزبون يستلم طلبه، **ثم** يتّصل بمشكلة فيه،
-- فيُعوَّض. أي أن التعويض يقع بعد البيع بساعة لا عند الكاونتر — ومكانه سجلّ
-- طلبات اليوم حيث يبحث الكاشير عن طلب الشاكي أصلاً.
--
-- وهذا العمود يربط الكوبون بالطلب الذي سبّبه، فيُقرأ لاحقاً سؤالٌ لم يكن
-- يُسأل: **كم طلباً اشتكى أصحابه؟** الكوبون وحده يقول «أعطينا خصماً»، ومعه
-- الطلب يقول «وهذا ما حدث».
--
-- ⚠ ولا يُخلط بـ`coupon_redemptions.order_id`: ذاك الطلب الذي **استُعمل**
-- فيه الكوبون، وهذا الطلب الذي **استحقّه**. طلبان مختلفان في الزمن والمعنى.

alter table public.coupons
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists coupons_order_idx on public.coupons(order_id);

comment on column public.coupons.order_id is
  'الطلب الذي سبّب التعويض — لا الطلب الذي استُعمل فيه الكوبون (ذاك في coupon_redemptions)';

notify pgrst, 'reload schema';
