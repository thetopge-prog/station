-- ═══ طلبات شركات التوصيل — من إشعار تطبيقها على جهازها ═══
--
-- لا واجهة برمجية عند توترز ولا طلباتي. تطبيق المتصل نفسه، على جهاز الشركة،
-- يقرأ إشعار «طلب جديد» ويرسله. إن حمل الإشعار الأصناف وطابقت المنيو صار
-- طلباً معلّقاً على شاشة الكاشير بزرّ قبول؛ وإلا صار تنبيهاً برقمه: «طلب
-- توترز #890 — افتح التطبيق». لا يُنسى طلب، ولا يُخترع صنف.

create table if not exists public.external_order_alerts (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('toters', 'talabaty', 'other')),
  ref text,
  title text,
  body text,
  -- إن طابقت الأصناف وأُنشئ طلب، هذا هو
  order_id uuid references public.orders(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists external_order_alerts_open on public.external_order_alerts(created_at desc) where handled_at is null;
alter table public.external_order_alerts enable row level security;
-- يُقرأ عبر عميل الخدمة خلف بوّابة الموظفين؛ لا دور عام يراه
revoke all on public.external_order_alerts from anon, authenticated;

-- مصدر الطلب يعرف الشركتين
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.orders'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%order_source%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.orders
  add constraint orders_order_source_check
  check (order_source in ('pos', 'web', 'whatsapp', 'telegram', 'toters', 'talabaty'));

notify pgrst, 'reload schema';
