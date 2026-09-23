-- ── الاسم مع الرقم، والطلب مربوطٌ بصاحبه ───────────────────────────────────
--
-- قرار المالك: من الغد لا يُكتب رقمُ زبون بلا اسمه. السبب في الأرقام: ٢٨٩ طلب
-- كاشير فيه رقم ولا اسم معه — أي ٢٨٩ مرّة عرفنا كيف نصل إلى الزبون ولم نعرف
-- بمن نناديه. والربط: ٩٨ طلباً يحمل رقماً ولا يشير إلى صفّ الزبون، فسجلّه
-- يُجمع بمطابقة نصّية في كل قراءة بدل مفتاحٍ ثابت.

-- ── ١. زبون الطلب ──────────────────────────────────────────────────────────
--
-- نداءٌ واحد يكفي: يوحّد الرقم، ويجد أو يُنشئ، ويكتب الاسم، ويعيد المعرّف.
-- يُستعمل من الكاشير ومن المنيو ومن البوت — مصدرٌ واحد للحقيقة، فلا يفترق
-- ثلاثة مسارات في تعريف «من هذا الزبون».
create or replace function public.customer_for_order(p_phone text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.norm_iq_phone(p_phone);
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
  v_id    uuid;
begin
  -- رقم لا يصلح للاتصال لا يصنع زبوناً: «6062» ليس شخصاً
  if v_phone is null then return null; end if;

  select id into v_id from customers where phone = v_phone limit 1;
  if not found then
    insert into customers(phone, name_ar) values (v_phone, v_name) returning id into v_id;
    return v_id;
  end if;

  -- الاسم الحقيقي يزيح الاسم التلقائي.
  --
  -- «عميل ستيشن78» ليس اسماً بل رقمُ انتظار وضعناه لئلا يبقى الصفّ فارغاً.
  -- ولو تركناه لَما حلّ محلَّه اسمٌ حقيقي أبداً: التعبئة القديمة كانت تملأ
  -- الفارغ فقط، وهذا ليس فارغاً. وإفراغ auto_seq يمنع المزامنة من إعادة
  -- تسميته.
  if v_name is not null then
    update customers
    set name_ar = v_name, auto_seq = null
    where id = v_id and (coalesce(trim(name_ar), '') = '' or auto_seq is not null);
  end if;
  return v_id;
end;
$$;

revoke all on function public.customer_for_order(text, text) from public, anon;
grant execute on function public.customer_for_order(text, text) to authenticated, service_role;

-- ── ٢. بطاقة الولاء تتبع القاعدة نفسها ─────────────────────────────────────
--
-- `create_card` كانت تطابق النصّ حرفياً (`phone = trim(p_phone)`) وتملأ الاسم
-- الفارغ فقط. بعد توحيد الأرقام في 0099 صار الأول يصنع مكرَّراً من «{ 787 699
-- 1800 }»، وبعد التسمية التلقائية صار الثاني يحبس «عميل ستيشن78» إلى الأبد.
create or replace function public.create_card(p_phone text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_serial text; v_id uuid; v_phone text := public.norm_iq_phone(p_phone);
begin
  if v_phone is not null then
    v_id := public.customer_for_order(v_phone, p_name);
    select card_serial into v_serial from customers where id = v_id;
    return v_serial;
  end if;
  -- بلا رقم صالح: بطاقةٌ بلا هاتف كما كانت — تُمسح باليد على الكاونتر
  insert into customers(phone, name_ar)
    values (nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_name, '')), ''))
    returning card_serial into v_serial;
  return v_serial;
end $$;

-- ── ٣. ربط ما مضى ──────────────────────────────────────────────────────────
-- الطلبات القديمة تحمل أرقاماً وصفوفُ أصحابها موجودة؛ ينقصها المفتاح وحده
update public.orders o
set customer_id = c.id
from public.customers c
where o.customer_id is null
  and public.norm_iq_phone(o.customer_phone) is not null
  and c.phone = public.norm_iq_phone(o.customer_phone);
