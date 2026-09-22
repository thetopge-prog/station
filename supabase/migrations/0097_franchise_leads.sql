-- 0097: طلبات الوكالة من الصفحة التعريفية.
--
-- زائر يملأ النموذج على stationiraq.com فيصل المالك على تيليغرام فوراً، ويبقى
-- الصفّ هنا ليُراجَع لاحقاً. لا أحد من الشبكة يقرأ الجدول: الكتابة بمفتاح
-- الخدمة من الخادم، والقراءة للموظفين.
create table if not exists public.franchise_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  phone text not null,
  note text,
  lang text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
alter table public.franchise_leads enable row level security;
revoke all on public.franchise_leads from anon;
grant select on public.franchise_leads to authenticated;

-- حدّ المعدّل: نفس الرقم لا يرسل أكثر من مرة في الساعة (يُفحص قبل الإدراج)
create index if not exists franchise_leads_phone_at on public.franchise_leads (phone, created_at desc);
