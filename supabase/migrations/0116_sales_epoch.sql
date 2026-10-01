-- «بداية المبيعات» — تصفير ما يُعرض، لا ما يُخزَّن.
--
-- طلبت الإدارة أن تبدأ المبيعات من الصفر في الشاشات. والحذف مستحيل: خطة
-- التجهيز تقرأ ٢٨ يوماً إلى الوراء، و«نتائج خطة اليوم» تعيد بناء خطة يومٍ
-- مضى من بيانات ما قبله — فحذف التاريخ يُسقط الاثنين في اللحظة نفسها.
--
-- فالحلّ تاريخُ بدايةٍ واحد: الطلبات كلّها تبقى، وشاشات المال وحدها تعرض ما
-- بعده. وهو نفس ما فعله 0018 بنطاقٍ أضيق (تصفير اليوم) وبنفس المنطق: صفٌّ
-- يُكتب، ولا صفٌّ يُحذف.
--
-- ⚠ ولا يُنادى من `range_summary`. تلك الدالّة يقرأ منها التوقّع كما يقرأ
-- العرض، ووضع القصّ فيها يجعل الخطط تقرأ أصفاراً. القصّ عند المنادي.

create table if not exists public.sales_epoch (
  -- صفٌّ واحد لا غير: المفتاح `true` والقيد يمنع `false`
  id boolean primary key default true check (id),
  start_day date not null,
  set_at timestamptz not null default now(),
  by_employee uuid
);
alter table public.sales_epoch enable row level security;
revoke all on public.sales_epoch from anon, authenticated;

-- تاريخٌ سحيق = لا شيء مقصوص = الترحيل يُطبَّق ولا تتغيّر شاشة واحدة.
-- والتبديل كلّه يصير لاحقاً بتحديث هذا الصفّ وحده، بلا نشرٍ ولا إعادة تشغيل.
insert into public.sales_epoch (id, start_day)
  values (true, date '1900-01-01')
  on conflict (id) do nothing;

create or replace function public.sales_epoch()
returns date language sql stable security definer set search_path = public as $$
  select coalesce((select start_day from public.sales_epoch where id), date '1900-01-01')
$$;

revoke all on function public.sales_epoch() from public, anon, authenticated;
grant execute on function public.sales_epoch() to service_role;

-- ── دفتر الزبائن ───────────────────────────────────────────────────────────
--
-- `total_spent` مبلغٌ يُعرض، فيُقصّ. و`orders_count` عدد لا مال، ويبقى كاملاً
-- بقرار المالك: «المبيعات والإيرادات فقط».
--
-- والتعريف منقولٌ من 0099 حرفيّاً عدا سطر الإنفاق — أي تغييرٍ آخر هنا يعني
-- تعريفين متنازعين لنفس العرض.
create or replace view public.customer_book as
with o as (
  select
    public.norm_iq_phone(customer_phone) as phone,
    count(*) filter (where status = 'paid') as orders_count,
    coalesce(sum(subtotal - discount + extra) filter (
      where status = 'paid' and business_day >= public.sales_epoch()
    ), 0)::bigint as total_spent,
    min(created_at) as first_order,
    max(created_at) as last_order,
    mode() within group (order by channel) as top_channel
  from public.orders
  where public.norm_iq_phone(customer_phone) is not null
  group by 1
)
select
  c.id,
  coalesce(public.norm_iq_phone(c.phone), c.phone) as phone,
  nullif(trim(c.name_ar), '') as name,
  c.auto_seq is not null as auto_named,
  c.points,
  coalesce(o.orders_count, 0)::int as orders_count,
  coalesce(o.total_spent, 0)::bigint as total_spent,
  o.first_order,
  o.last_order,
  o.top_channel,
  c.address,
  c.created_at
from public.customers c
left join o on o.phone = public.norm_iq_phone(c.phone);

revoke all on public.customer_book from public, anon, authenticated;
grant select on public.customer_book to service_role;

notify pgrst, 'reload schema';
