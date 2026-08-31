-- 0050_queue_updated_at.sql — متى صار الطلب جاهزاً، لا فقط أنه جاهز.
--
-- شاشة الاستلام في السقف لا تشغّل مؤقّتات: متصفح التلفزيون يوقفها على صفحة
-- لا يلمسها أحد. لذلك الشاشة تُحدَّث بترويسة Refresh كل عشر ثوانٍ، وكل تحديث
-- صفحة جديدة لا تعرف ماذا كان معروضاً قبلها.
--
-- ومن دون هذه المعرفة لا يمكن رنّ الجرس: «يوجد طلب جاهز» صحيح في كل تحديث،
-- فالجرس إما يرنّ بلا توقف أو لا يرنّ أبداً. أما «صار جاهزاً في آخر عشر ثوانٍ»
-- فيصحّ مرة واحدة — وهي اللحظة التي يجب أن يرفع الزبون رأسه فيها.
--
-- updated_at لا ينكشف به شيء: العرض أصلاً بلا أي عمود مالي (0028/0032)، وهذا
-- طابع زمني على طلب معروض رقمه على الجدار.

drop view if exists public.queue_public;
create view public.queue_public as
  select
    o.id,
    o.order_seq,
    o.pickup_code,
    -- what the TV shows: two columns, never three
    (case when o.prep_status = 'ready' then 'ready' else 'preparing' end)::text as prep_status,
    o.table_no,
    o.channel,
    o.created_at,
    o.updated_at,
    o.eta_minutes,
    c.name_ar as cashier_name,
    e.name_ar as expediter_name
  from public.orders o
  left join public.employees c on c.id = o.cashier_id
  left join public.employees e on e.id = o.expediter_id
  where o.business_day = (now() at time zone 'Asia/Baghdad')::date
    and o.prep_status in ('new', 'preparing', 'ready')
    and o.status <> 'cancelled'
  order by case when o.prep_status = 'ready' then 0 else 1 end, o.created_at;

grant select on public.queue_public to authenticated;
