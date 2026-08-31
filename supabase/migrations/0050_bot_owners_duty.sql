-- 0050 — مسؤولو البوت، ومجهّزو اليوم.

/*
 * مسؤولو بوت تليغرام.
 *
 * كانوا في متغيّر بيئة `TG_OWNER_IDS`: إضافة شخص تعني تعديل إعدادات المشروع
 * وإعادة نشر الدالة — أي أنها تحتاجني، لا صاحب المحل. والمحل يوظّف ويستغني
 * في يوم واحد.
 *
 * المتغيّر يبقى عاملاً كـ«مالك أصلي» لا يُحذف من هنا مهما جرى — فلا يمكن أن
 * يُقفل أحد الباب على نفسه بحذف آخر مسؤول من داخل البوت.
 */
create table if not exists public.bot_owners (
  chat_id text primary key,
  label text,
  added_by text,
  created_at timestamptz not null default now()
);

comment on table public.bot_owners is
  'من يُسمح له باستعمال بوت تليغرام — يُضاف ويُحذف من داخل البوت نفسه.';

-- البوت وحده يقرأها، وهو يعمل بمفتاح الخدمة. لا أحد غيره.
revoke all on public.bot_owners from public, anon, authenticated;

/*
 * مجهّزو اليوم.
 *
 * شاشة التجهيز تعمل بحساب واحد يتناوب عليه أكثر من شخص، فالنظام لا يعرف من
 * كان على الرصيف فعلاً. الكاشير يعرف — فهو يراهم. يؤشّرهم مرة في بداية اليوم
 * فيُحفظ من كان يعمل، ويُقرأ لاحقاً في التقارير والأجور.
 *
 * مفتاحه (اليوم، الموظف): أكثر من مجهّز في اليوم الواحد أمر عادي لا استثناء.
 */
create table if not exists public.duty_expediters (
  business_day date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (business_day, employee_id)
);

comment on table public.duty_expediters is
  'من كان يجهّز في يوم عمل معيّن — يؤشّرهم الكاشير، لأنه الوحيد الذي يراهم.';

alter table public.duty_expediters enable row level security;

drop policy if exists duty_read on public.duty_expediters;
create policy duty_read on public.duty_expediters
  for select to authenticated using (public.is_staff());

-- الكتابة عبر الدالة أدناه فقط، فهي التي تستبدل قائمة اليوم كاملة
revoke insert, update, delete on public.duty_expediters from authenticated;
grant select on public.duty_expediters to authenticated;

/**
 * استبدال قائمة اليوم كاملة بالمؤشَّرين الجدد.
 *
 * استبدال لا إضافة: الكاشير يصحّح القائمة حين ينصرف أحدهم أو يأتي آخر، وواجهة
 * تُضيف ولا تحذف تترك اسماً لا يستطيع أحد إزالته.
 */
create or replace function public.set_duty_expediters(p_day date, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff'; end if;

  delete from duty_expediters where business_day = p_day;
  if p_ids is not null and array_length(p_ids, 1) > 0 then
    insert into duty_expediters (business_day, employee_id)
    select p_day, unnest(p_ids)
    on conflict do nothing;
  end if;
end $$;

revoke all on function public.set_duty_expediters(date, uuid[]) from public, anon;
grant execute on function public.set_duty_expediters(date, uuid[]) to authenticated;
