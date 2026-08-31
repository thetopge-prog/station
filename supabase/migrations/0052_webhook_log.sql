-- 0052 — سجل آخر ما وصل من الهاتف.
--
-- سجل ماكرودرويد يقول «التقطت 07831551888» ثم «422». والاثنان صحيحان: الرقم
-- ظاهر على الهاتف، ولم يصل إلى الخادم. ما بينهما — نصّ الطلب فعلاً — لم يكن
-- يراه أحد، فصار كل تشخيص تخميناً.
--
-- هذا الجدول يحفظ ما وصل حرفياً. عشرون سطراً تكفي: هو أداة تركيب لا أرشيف.
create table if not exists public.webhook_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  route text not null,
  status int not null,
  -- كلمة السر تُستبدل قبل الكتابة — سجل تشخيص لا يجوز أن يصير مكان تسريبها
  body text,
  note text
);

comment on table public.webhook_log is
  'آخر ما وصل إلى /api/calls — لصفحة التركيب. كلمة السر محذوفة، والقديم يُقلَّم.';

revoke all on public.webhook_log from public, anon;
grant select on public.webhook_log to authenticated;

alter table public.webhook_log enable row level security;
drop policy if exists webhook_log_read on public.webhook_log;
create policy webhook_log_read on public.webhook_log
  for select to authenticated using (public.is_staff());

/** يكتب سطراً ويقلّم ما زاد عن العشرين. */
create or replace function public.log_webhook(p_route text, p_status int, p_body text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into webhook_log (route, status, body, note) values (p_route, p_status, left(p_body, 600), p_note);
  delete from webhook_log where id not in (
    select id from webhook_log order by id desc limit 20
  );
end $$;

revoke all on function public.log_webhook(text, int, text, text) from public, anon, authenticated;
