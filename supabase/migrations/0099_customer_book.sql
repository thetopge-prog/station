-- ── سجلّ أرقام الزبائن ──────────────────────────────────────────────────────
--
-- الأرقام موجودة في النظام منذ اليوم الأول لكن لا أحد يستطيع النظر إليها:
-- ٢٢٨ رقماً في `orders` و٢٣٨ صفاً في `customers`، و٢٠٨ منها لم يُكتب معه اسم
-- قط (٢٨٩ طلب كاشير فيه رقم بلا اسم). لا قائمة، ولا ترتيب بالأكثر طلباً، ولا
-- تصدير. هذا الترحيل يبني الأساس: توحيد الرقم، وهوية ثابتة، واسم لكل زبون.

-- ── ١. توحيد الرقم ─────────────────────────────────────────────────────────
--
-- الرقم نفسه مخزَّن بثلاث صيغ حسب من كتبه: «07…» من الكاشير والمنيو،
-- «9647…» من نموذج الوكالة ومن معرّف واتساب، و«٠٧…» بأرقام عربية من شاشةٍ
-- قُرئت. والصيغة الواحدة بثلاثة أشكال ثلاثةُ زبائن لا واحد.
--
-- نفس منطق normalizeIraqiPhone في src/lib/cafe/phone.ts — وهو المرجع.
create or replace function public.norm_iq_phone(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if p_raw is null then return null; end if;
  -- الأرقام العربية والفارسية إلى اللاتينية، ثم يُطرح كل ما ليس رقماً
  d := translate(p_raw, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '\D', '', 'g');
  if d = '' then return null; end if;
  if left(d, 5) = '00964' then d := substr(d, 6);
  elsif left(d, 3) = '964' then d := substr(d, 4);
  end if;
  if left(d, 1) <> '0' then d := '0' || d; end if;
  -- ما لا يطابق الشكل يُردّ NULL ولا يُحذف: الصفحة تعرضه في «أرقام تحتاج تصحيحاً»
  return case when d ~ '^07\d{9}$' then d else null end;
end;
$$;

-- ── ٢. الهوية الثابتة ──────────────────────────────────────────────────────
--
-- `customers.phone` فريد، فهو الهوية. و`orders.customer_name` لكل طلب لا لكل
-- زبون: من له خمسة طلبات بلا اسم كان سيأخذ خمسة أسماء تلقائية لو بُني الاسم
-- على الطلب. والتسلسل يُحفَظ في عمود لا يُحسَب في كل قراءة، وإلا تبدّل رقم
-- الزبون كلما دخل زبونٌ جديد قبله.
alter table public.customers add column if not exists auto_seq int;

-- ── ٢أ. دمج المكرَّر ثم تثبيت الصيغة ───────────────────────────────────────
--
-- في القاعدة اليوم عشرة صفوف هي أربعة أشخاص: «{ 787 699 1800 }» بأقواس
-- الكاشير، و«783 777 6650» بفراغات، و«7837776650» بلا صفر. كلٌّ منها صفٌّ
-- مستقلّ بنقاط ولاء مستقلّة وعنوانٍ لا يجده أحد. الأقدم يبقى، ويرث نقاط
-- إخوته وعنوانَهم واسمَهم إن كان لديهم ما ليس لديه، ثم تُنقل إليه إحالاتهم
-- ويُحذفون. ولولا هذا لبقي الفهرس الفريد مستحيلاً والسجلّ يعدّ الشخص أربعة.
with g as (
  select id, public.norm_iq_phone(phone) np,
         first_value(id) over (partition by public.norm_iq_phone(phone) order by created_at, id) keep_id
  from public.customers
  where public.norm_iq_phone(phone) is not null
), dup as (select id, keep_id from g where id <> keep_id)
update public.customers k
set points   = k.points + coalesce((select sum(d.points) from public.customers d join dup on dup.id = d.id where dup.keep_id = k.id), 0),
    name_ar  = coalesce(nullif(trim(k.name_ar), ''), (select max(nullif(trim(d.name_ar), '')) from public.customers d join dup on dup.id = d.id where dup.keep_id = k.id)),
    address  = coalesce(k.address, (select max(d.address) from public.customers d join dup on dup.id = d.id where dup.keep_id = k.id))
where k.id in (select keep_id from dup);

with g as (
  select id, first_value(id) over (partition by public.norm_iq_phone(phone) order by created_at, id) keep_id
  from public.customers
  where public.norm_iq_phone(phone) is not null
), dup as (select id, keep_id from g where id <> keep_id)
update public.orders o set customer_id = dup.keep_id from dup where o.customer_id = dup.id;

with g as (
  select id, first_value(id) over (partition by public.norm_iq_phone(phone) order by created_at, id) keep_id
  from public.customers
  where public.norm_iq_phone(phone) is not null
), dup as (select id, keep_id from g where id <> keep_id)
update public.loyalty_events e set customer_id = dup.keep_id from dup where e.customer_id = dup.id;

with g as (
  select id, first_value(id) over (partition by public.norm_iq_phone(phone) order by created_at, id) keep_id
  from public.customers
  where public.norm_iq_phone(phone) is not null
), dup as (select id, keep_id from g where id <> keep_id)
update public.incoming_calls c set customer_id = dup.keep_id from dup where c.customer_id = dup.id;

with g as (
  select id, first_value(id) over (partition by public.norm_iq_phone(phone) order by created_at, id) keep_id
  from public.customers
  where public.norm_iq_phone(phone) is not null
)
delete from public.customers where id in (select id from g where id <> keep_id);

-- الصيغة تُثبَّت في العمود نفسه: البحث والمطابقة لا يمرّان بدالّة في كل مرّة
update public.customers
set phone = public.norm_iq_phone(phone)
where public.norm_iq_phone(phone) is not null and phone <> public.norm_iq_phone(phone);

create unique index if not exists customers_auto_seq_key on public.customers(auto_seq) where auto_seq is not null;
create index if not exists orders_customer_phone_norm_idx on public.orders(public.norm_iq_phone(customer_phone)) where public.norm_iq_phone(customer_phone) is not null;

-- ── ٣. المزامنة ────────────────────────────────────────────────────────────
--
-- قابلة للتكرار بلا أثر: تشغيلها مرّتين يعطي النتيجة نفسها بالضبط. تُنادى من
-- زرّ في الصفحة ومن المهمّة الليلية.
--
--   ١) صفُّ زبون لكل رقم في الطلبات لا صفَّ له.
--   ٢) أوّل اسم حقيقي ظهر مع الرقم يملأ الاسم الفارغ — من كُتب باسمه لا يُلمَس.
--   ٣) من بقي بلا اسم يأخذ «عميل ستيشن N»، مرتّباً بتاريخ أوّل طلب، فالرقم
--      يثبت لصاحبه ولا يتبدّل في المزامنة التالية.
create or replace function public.sync_customer_book()
returns table (added int, named int, auto_named int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added int := 0;
  v_named int := 0;
  v_auto int := 0;
  v_next int;
begin
  -- ١) أرقام الطلبات التي لا صفَّ لها
  with seen as (
    select public.norm_iq_phone(customer_phone) as ph, min(created_at) as first_at
    from public.orders
    where public.norm_iq_phone(customer_phone) is not null
    group by 1
  ), missing as (
    select s.ph, s.first_at from seen s
    where not exists (
      select 1 from public.customers c where public.norm_iq_phone(c.phone) = s.ph
    )
  ), ins as (
    -- card_serial يُترك لقيمته الافتراضية: تعليق 0001 يسمّيه «حمولة QR لا
    -- تُخمَّن»، وصناعته من رقم الهاتف تجعل بطاقة أيّ زبون قابلة للتركيب بيد
    insert into public.customers (phone, created_at)
    select m.ph, m.first_at from missing m
    returning 1
  )
  select count(*) into v_added from ins;

  -- ٢) الاسم الحقيقي الأول لهذا الرقم
  with named as (
    select public.norm_iq_phone(o.customer_phone) as ph,
           (array_agg(o.customer_name order by o.created_at))[1] as nm
    from public.orders o
    where public.norm_iq_phone(o.customer_phone) is not null
      and coalesce(trim(o.customer_name), '') <> ''
    group by 1
  ), upd as (
    update public.customers c
    set name_ar = n.nm
    from named n
    where public.norm_iq_phone(c.phone) = n.ph
      and coalesce(trim(c.name_ar), '') = ''
    returning 1
  )
  select count(*) into v_named from upd;

  -- ٣) الباقي يأخذ اسماً تلقائياً بترتيب أقدميته
  select coalesce(max(auto_seq), 0) + 1 into v_next from public.customers;
  with pending as (
    select c.id, row_number() over (order by c.created_at, c.id) - 1 as k
    from public.customers c
    where coalesce(trim(c.name_ar), '') = '' and c.auto_seq is null
  ), upd2 as (
    update public.customers c
    set auto_seq = v_next + p.k,
        name_ar = 'عميل ستيشن' || (v_next + p.k)::text
    from pending p
    where c.id = p.id
    returning 1
  )
  select count(*) into v_auto from upd2;

  added := v_added; named := v_named; auto_named := v_auto;
  return next;
end;
$$;

revoke all on function public.sync_customer_book() from public, anon, authenticated;
grant execute on function public.sync_customer_book() to service_role;

-- ── ٤. العرض ───────────────────────────────────────────────────────────────
--
-- التجميع في SQL والقراءة في TypeScript — نفس نمط debtor_balances
-- و partner_balances. الطلبات الملغاة لا تُعدّ ولا تُحسب في الإنفاق.
create or replace view public.customer_book as
with o as (
  select
    public.norm_iq_phone(customer_phone) as phone,
    count(*) filter (where status = 'paid') as orders_count,
    coalesce(sum(subtotal - discount + extra) filter (where status = 'paid'), 0)::bigint as total_spent,
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
