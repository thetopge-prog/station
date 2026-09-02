-- صلاحيات متعددة · وردية الموظف · سجلّ الحضور.
--
-- المطعم ورديتان (٩ص–٣ع و٣ع–٣ف)، والموظف قد يحمل أكثر من صلاحية: عمر محمد
-- كاشير ومجهّز معاً. والنظام اليوم يعرف صلاحية واحدة لكل موظف — عموداً قياسياً
-- لا جدول ربط — فالحلّ الوحيد أمام صاحب المحل كان أن يجعله «مديراً»، وهو منح
-- كارثي: يفتح الأرباح والرواتب والمنيو وكل شيء، لأن أحدهم يُجهّز الطلبات أيضاً.

-- ═══ ١. صلاحيات متعددة ═══
--
-- جدول ربط، و employees.role_id **يبقى** كصلاحية أساسية.
--
-- وهذا هو بيت القصيد: كل حساب قائم اليوم يعمل كما هو دون لمسه، وكل شيفرة تقرأ
-- `role` تبقى صحيحة. الجديد يُضاف ولا شيء يُهاجَر — وصاحب المحل قال صراحةً
-- «لا تحذف الحسابات الحالية».
create table if not exists public.employee_roles (
  employee_id uuid not null references public.employees(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, role_id)
);

alter table public.employee_roles enable row level security;
revoke all on public.employee_roles from anon, authenticated;

-- الصلاحية الحالية تصير أول صفّ في الجدول، فيصبح الجدول وحده كافياً للقراءة
-- ولا يبقى مصدران للحقيقة يفترقان.
insert into public.employee_roles (employee_id, role_id)
  select id, role_id from public.employees where role_id is not null
  on conflict do nothing;

-- roles.name_en يُبحث به بالاسم في أربعة مواضع ولم يكن فريداً (بخلاف
-- stations.name_en). فحصتُ: لا تكرار اليوم — والقيد يمنع أن يظهر غداً.
create unique index if not exists roles_name_en_key on public.roles (name_en);

-- ═══ ٢. الوردية — عمود واحد، وفارغه يعني «بلا قيد» ═══
--
-- يتبع سابقة station_id حرفياً: عمود واحد قابل للفراغ، حقل واحد في النموذج،
-- سطر في Staff، ومستهلك واحد. وقد كلّفت تلك السابقة صفر أعطال.
--
-- والفارغ مقصود: الحسابات المشتركة (كاشير=1 · مجهّز=2 · إدارة=3) يتناوب عليها
-- أشخاص، فلا وردية لها ولا تُمنع — وهو ما اختاره صاحب المحل.
alter table public.employees
  add column if not exists shift_period text
    check (shift_period is null or shift_period in ('morning', 'evening'));

comment on column public.employees.shift_period is
  'morning ٠٩–١٥ · evening ١٥–٠٣ · فارغ = بلا قيد وقت';

-- ═══ ٣. يوم الدوام — لا يتقلّب في منتصف الوردية ═══
--
-- business_day يوم تقويمي بغدادي يتقلّب عند منتصف الليل بالضبط. فوردية
-- ٣ع–٣ف تقع في يومين: مبيعاتها مقسومة على تقريرين، وعدّاد الطلبات يبدأ من
-- جديد في منتصف الخدمة، والمجهّز يختفي من الشريط.
--
-- ولن أغيّر business_day — يمسّ كل جدول وكل تقرير في النظام. لكن سجلّ الحضور
-- يحمل يومه الخاص، مُزاحاً أربع ساعات، فتبقى وردية المساء **سطراً واحداً**.
-- وأربع ساعات لأنها بعد نهاية أطول وردية (٠٣:٠٠) وقبل بداية أبكرها (٠٩:٠٠).
create or replace function public.work_day_of(p_at timestamptz)
returns date language sql immutable set search_path = public as $fn$
  select ((p_at at time zone 'Asia/Baghdad') - interval '4 hours')::date;
$fn$;

-- ═══ ٤. الحضور ═══
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  /** وردية الموظف لحظة الحضور — تُجمَّد هنا فلا يغيّر تعديلٌ لاحق تاريخاً مضى */
  shift text check (shift is null or shift in ('morning', 'evening')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  work_day date not null default public.work_day_of(now()),
  /** أُقفل تلقائياً لأن أحداً نسي تسجيل الخروج — لا يُقرأ كانصرافٍ حقيقي */
  auto_closed boolean not null default false,
  created_at timestamptz not null default now()
);

-- سطر مفتوح واحد لكل موظف. بدونه يفتح كل تحديث للصفحة سطراً جديداً.
create unique index if not exists attendance_one_open
  on public.attendance (employee_id) where ended_at is null;
create index if not exists attendance_day_idx on public.attendance (work_day);

alter table public.attendance enable row level security;
revoke all on public.attendance from anon, authenticated;

-- ═══ ٥. استثناء اليوم ═══
--
-- المنع بلا مخرج يوقف البيع: كاشير صباحي عند ٣:٠١ والمسائي لم يصل. فالمهلة
-- ساعة، وهذا الجدول هو المخرج الثاني — يفتح موظفاً بعينه ليوم بعينه بضغطة.
create table if not exists public.shift_exceptions (
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_day date not null,
  reason text,
  by_employee uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (employee_id, work_day)
);

alter table public.shift_exceptions enable row level security;
revoke all on public.shift_exceptions from anon, authenticated;

-- ═══ ٦. التعديلان اللذان يحوّلان طبقة القاعدة كلها ═══
--
-- كل فحص صلاحية في القاعدة يمرّ بهاتين الدالتين بالاسم — ستّ نداءات لـ
-- is_admin() (منها سياسة RLS واحدة) ونداءان لـ is_role(). فاستبدال جسميهما
-- يحوّل النظام كله إلى الصلاحيات المتعددة دون لمس مستدعٍ واحد.
--
-- ويقرآن الجدولين معاً: الربط الجديد **أو** العمود القديم. فلو فشل الملء أعلاه
-- أو أُضيف موظف بالطريقة القديمة، تبقى صلاحيته نافذة.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from employees e
     where e.auth_user_id = auth.uid() and e.is_active
       and (
         exists (select 1 from employee_roles er join roles r on r.id = er.role_id
                  where er.employee_id = e.id and r.name_en = 'admin')
         or exists (select 1 from roles r where r.id = e.role_id and r.name_en = 'admin')
       )
  );
$fn$;

create or replace function public.is_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from employees e
     where e.auth_user_id = auth.uid() and e.is_active
       and (
         exists (select 1 from employee_roles er join roles r on r.id = er.role_id
                  where er.employee_id = e.id and (r.name_en = 'admin' or r.name_en = any(p_roles)))
         or exists (select 1 from roles r where r.id = e.role_id
                     and (r.name_en = 'admin' or r.name_en = any(p_roles)))
       )
  );
$fn$;

-- ═══ ٧. فتح الحضور وإقفاله ═══

/**
 * يفتح سطر حضور إن لم يكن للموظف سطر مفتوح.
 *
 * يُنادى عند أول طلب بعد تسجيل الدخول — أي مع كل إخفاق في ذاكرة الجلسة (٦٠
 * ثانية)، لا مع كل طلب. و `on conflict do nothing` تجعل النداء المتكرر بلا أثر،
 * فلا حاجة لقفل ولا لفحص مسبق.
 */
create or replace function public.attendance_open(p_employee uuid, p_shift text)
returns void language sql security definer set search_path = public as $fn$
  insert into attendance (employee_id, shift)
  select p_employee, p_shift
  on conflict (employee_id) where ended_at is null do nothing;
$fn$;

create or replace function public.attendance_close(p_employee uuid)
returns void language sql security definer set search_path = public as $fn$
  update attendance set ended_at = now()
   where employee_id = p_employee and ended_at is null;
$fn$;

/**
 * يُقفل ما نسيه أصحابه.
 *
 * تسجيل الخروج نادر — يُغلق الناس المتصفح ويذهبون. فسطر مفتوح منذ أكثر من
 * أربع عشرة ساعة ليس دواماً بل نسياناً، ويُوسم auto_closed حتى لا يُقرأ كانصراف
 * حقيقي. نفس ما يفعله 0048 مع أدراج النقد المنسية.
 */
create or replace function public.attendance_autoclose()
returns int language sql security definer set search_path = public as $fn$
  with done as (
    update attendance set ended_at = now(), auto_closed = true
     where ended_at is null and started_at < now() - interval '14 hours'
     returning 1
  ) select count(*)::int from done;
$fn$;

grant execute on function public.work_day_of(timestamptz) to authenticated, service_role;
grant execute on function public.attendance_open(uuid, text) to service_role;
grant execute on function public.attendance_close(uuid) to service_role;
grant execute on function public.attendance_autoclose() to service_role;
