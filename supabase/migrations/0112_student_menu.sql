-- منيو الطلاب — الطبقة السفلى.
--
-- منيو مغلق: الطالب يسجّل، تُقرأ هويته، تقبله الإدارة، فيرى أصنافاً وأسعاراً
-- لا يراها غيره. ويدعو زملاءه برابطه فيربح نقاطاً حين يُقبَل من دعاه.
--
-- والمخاطرة كلّها في سطرٍ واحد: **السعر يُحسب هنا، لا في المتصفّح**. فحتى لو
-- زوّر أحدٌ طلبه وادّعى أنه طالب، لا يُسعَّر تسعيرَ الطلاب إلا إذا كانت حالته
-- `active` في هذا الجدول. وهي قاعدة place_order الأصلية، تمتدّ ولا تُخرَق.

-- ═══ ١. الطلاب ═══════════════════════════════════════════════════════════
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  -- مفتاح صفحته، لا يُخمَّن. نفس فكرة customers.card_serial (0001): من يملك
  -- الرابط يملك الصفحة، فلا كلمة مرور على زبونٍ لن يحفظها
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  -- رمز دعوته — قصير لأنه يُكتب ويُقرأ ويُرسَل في رسالة
  ref_code text not null unique default encode(gen_random_bytes(4), 'hex'),
  referred_by uuid references public.students(id) on delete set null,
  -- ربطه بسجلّ الزبائن: النقاط والطلبات كلّها هناك، فلا سجلّ ثانٍ يُصان
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null unique,
  name_ar text not null,
  university text not null,
  college text,
  instagram text,
  /*
   * بصمة البطاقة لا رقمها.
   *
   * تمنع البطاقة الواحدة من فتح حسابين، ولا تحتاج الاحتفاظ بالرقم نفسه.
   * وهي SHA-256 لرقم الطالب مع جامعته — يحسبها الخادم ولا تصل القاعدة إلا
   * مبصومة.
   */
  id_hash text unique,
  -- ما قرأته الكاميرا، نصّاً، ليراجعه الإنسان. **ولا صورة تُخزَّن أبداً**
  id_name text,
  id_university text,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  reject_note text,
  reviewed_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists students_status_idx on public.students(status);
create index if not exists students_referred_by_idx on public.students(referred_by);

comment on column public.students.id_hash is
  'بصمة رقم البطاقة مع الجامعة — تمنع تكرار التسجيل بنفس الهوية. الصورة لا تُخزَّن.';

-- ═══ ٢. أسعار الطلاب على المنيو ═════════════════════════════════════════
--
-- عمودان لا واحد: الصنف حجمُه الأساسي، وكل حجمٍ سعرُه. فلو وُضع سعر طالبٍ
-- للصنف وحده لبِيعت **الوجبة** بسعر الساندويچ — وهي أغلى بألفين. والقاعدة
-- تحت تجعل الحجم يغلب، فالافتراض الآمن: لا خصم على حجمٍ لم يُكتب له خصم.
alter table public.menu_items  add column if not exists student_price int;
alter table public.menu_items  add column if not exists student_only boolean not null default false;
alter table public.item_variants add column if not exists student_price int;

comment on column public.menu_items.student_price is 'سعر الطالب للحجم الأساسي. فارغ = لا خصم.';
comment on column public.menu_items.student_only is 'لا يظهر إلا في منيو الطلاب.';
comment on column public.item_variants.student_price is 'سعر الطالب لهذا الحجم. فارغ = لا خصم على هذا الحجم.';

-- ═══ ٣. المناظر ═════════════════════════════════════════════════════════
--
-- العام يُخفي أصناف الطلاب. وبلا هذا السطر يتسرّب صنفٌ بسعرٍ طلابيّ إلى كل
-- زبون على `/menu` و`/kiosk` — وهو أسوأ ما يمكن أن يخطئ فيه هذا الترحيل.
create or replace view public.menu_public as
  select mi.id, mi.category_id, mi.name_ar, mi.name_en, mi.description_ar, mi.description_en,
         mi.image_url, mi.price, mi.flavors, mi.sort,
         c.name_ar as category_name, c.name_en as category_name_en,
         c.image_url as category_image, c.sort as category_sort, c.late_cutoff as category_late_cutoff
  from public.menu_items mi
    join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active and not mi.student_only;

-- ومنيو الطالب: كل شيء، بسعر الطالب حيث وُجد
create or replace view public.student_menu_public as
  select mi.id, mi.category_id, mi.name_ar, mi.name_en, mi.description_ar, mi.description_en,
         mi.image_url,
         coalesce(mi.student_price, mi.price) as price,
         mi.flavors, mi.sort, mi.student_only,
         c.name_ar as category_name, c.name_en as category_name_en,
         c.image_url as category_image, c.sort as category_sort, c.late_cutoff as category_late_cutoff
  from public.menu_items mi
    join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active;

create or replace view public.student_variant_public as
  select v.id, v.item_id, v.kind, v.name_ar, v.name_en,
         coalesce(v.student_price, v.price_override, mi.student_price, mi.price) as price,
         v.sort
  from public.item_variants v
    join public.menu_items mi on mi.id = v.item_id
  where v.is_active and mi.is_active;

grant select on public.student_menu_public, public.student_variant_public to anon, authenticated;
revoke insert, update, delete on public.student_menu_public from anon, authenticated;
revoke insert, update, delete on public.student_variant_public from anon, authenticated;

-- ═══ ٤. أبواب الطالب العامّة ════════════════════════════════════════════
--
-- سطحٌ ضيّق كما في 0070: دالّتان لـ`anon`، كلٌّ تعيد ما يلزم صفحته ولا شيء
-- غيره. لا جدول `students` مقروء من المتصفّح، ولا حالةُ أحدٍ سوى صاحب الرمز.
create or replace function public.student_by_token(p_token text)
returns table(id uuid, name_ar text, status text, ref_code text, university text, points int, invited int)
language sql security definer set search_path = public stable as $$
  select s.id, s.name_ar, s.status, s.ref_code, s.university,
         coalesce(c.points, 0),
         (select count(*)::int from students x where x.referred_by = s.id and x.status = 'active')
  from students s
    left join customers c on c.id = s.customer_id
  where s.token = p_token
$$;

/**
 * تسجيل طالب. تُنادى من صفحةٍ عامّة، فكل ما فيها يُنظَّف هنا لا هناك.
 *
 * والحالة `pending` دائماً: القراءة بالكاميرا تُرشِّح ولا تحكم، والإنسان
 * يقبل. فخطأ النموذج لا يفتح الباب على خصمٍ أربعين بالمئة.
 */
create or replace function public.register_student(
  p_name text, p_university text, p_phone text,
  p_college text default null, p_instagram text default null,
  p_id_hash text default null, p_id_name text default null, p_id_university text default null,
  p_ref text default null
) returns text language plpgsql security definer set search_path = public as $$
declare v_phone text; v_ref uuid; v_customer uuid; v_token text;
begin
  v_phone := public.norm_iq_phone(p_phone);
  if v_phone is null then raise exception 'bad phone'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'bad name'; end if;
  if length(trim(coalesce(p_university, ''))) < 2 then raise exception 'bad university'; end if;

  -- مسجَّلٌ سلفاً: يُعاد رمزه بدل صفٍّ ثانٍ. والطالب ينسى أنه سجّل، فيسجّل
  -- ثانيةً — وهذا يردّه إلى صفحته بدل أن يقول له «الرقم مستعمل»
  select token into v_token from students where phone = v_phone;
  if v_token is not null then return v_token; end if;

  if p_id_hash is not null and exists (select 1 from students where id_hash = p_id_hash) then
    raise exception 'id already used';
  end if;

  if p_ref is not null then
    select id into v_ref from students where ref_code = trim(p_ref) and status = 'active';
  end if;

  v_customer := public.customer_for_order(v_phone, trim(p_name));

  insert into students (phone, name_ar, university, college, instagram,
                        id_hash, id_name, id_university, referred_by, customer_id)
    values (v_phone, left(trim(p_name), 120), left(trim(p_university), 120),
            nullif(left(trim(coalesce(p_college, '')), 120), ''),
            nullif(left(regexp_replace(trim(coalesce(p_instagram, '')), '^@', ''), 60), ''),
            p_id_hash, nullif(left(trim(coalesce(p_id_name, '')), 120), ''),
            nullif(left(trim(coalesce(p_id_university, '')), 120), ''),
            v_ref, v_customer)
    returning token into v_token;
  return v_token;
end $$;

revoke all on function public.register_student(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.student_by_token(text) to anon, authenticated;
grant execute on function public.register_student(text, text, text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
