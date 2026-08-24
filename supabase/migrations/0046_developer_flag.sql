-- 0046_developer_flag.sql — من يرى صفحة التركيب.
--
-- «مدير» و«مطوّر» ليسا الشيء نفسه. المدير يدير مطعماً: الأسعار، الموظفون،
-- التقارير. أما صفحة /setup فتحمل أمر تثبيت برمجيات على جهاز الكاشير وعناوين
-- الطابعات — وهذه ليست من عمل من يدير المطعم يومياً، حتى لو كان مديراً.
--
-- علامة على السطر لا دور جديد: الأدوار تحكم الشاشات (كاشير، مجهّز، طباخ)،
-- وإضافة دور خامس هنا كانت ستعني مراجعة كل بوابة في النظام من أجل صفحة واحدة.
alter table public.employees
  add column if not exists is_developer boolean not null default false;

-- صاحب النظام. يُطابَق بالبريد لا بالمعرّف، فالمعرّف يتغيّر لو أُعيد إنشاء الحساب.
update public.employees e
   set is_developer = true
  from auth.users u
 where u.id = e.auth_user_id
   and lower(u.email) = '07844446633@station.iq';

grant select (is_developer) on public.employees to authenticated;

comment on column public.employees.is_developer is
  'يرى /setup — أمر التثبيت وعناوين الطابعات وروابط الشاشات. تُضبط من قاعدة البيانات لا من الواجهة.';
