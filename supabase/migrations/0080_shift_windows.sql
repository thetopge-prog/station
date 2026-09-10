-- ═══ أوقات الدوام تصير بيانات تُعدَّل، لا ثوابت في الشيفرة ═══
--
-- كانت النافذتان مكتوبتين في ثلاثة مواضع من الشيفرة (work-shift.ts للمنع،
-- attendance-actions.ts لحساب التأخير، AccountsClient.tsx للتسمية)، فتغيير
-- ساعة عمل يحتاج نشراً جديداً — والمطعم يغيّرها بقرار في المساء.
--
-- بالدقائق من منتصف ليل بغداد، وما تجاوز ١٤٤٠ يعني اليوم التالي: المسائية
-- تنتهي ١٦٢٠ أي ٠٣:٠٠ فجراً. نفس اصطلاح WINDOW الذي كان في الشيفرة.
--
-- القيم المبذورة هي دوام المطعم الحالي: ٠٩:٠٠–١٨:٠٠ و١٨:٠٠–٠٣:٠٠.

create table if not exists public.shift_windows (
  period     text primary key check (period in ('morning', 'evening')),
  start_min  int  not null check (start_min >= 0    and start_min < 1440),
  end_min    int  not null check (end_min   >  0    and end_min   <= 2880),
  updated_at timestamptz not null default now(),
  constraint shift_windows_order check (end_min > start_min)
);

insert into public.shift_windows(period, start_min, end_min) values
  ('morning',  9 * 60, 18 * 60),
  ('evening', 18 * 60, 27 * 60)
on conflict (period) do nothing;

alter table public.shift_windows enable row level security;
-- بلا منح وبلا سياسة: تُقرأ وتُكتب بمفتاح الخدمة خلف requireStaff/requireAdmin،
-- كجدولَي attendance وshift_exceptions في 0062. ووقت انتهاء الوردية يصل
-- المتصفح لحظةً محسوبة على الخادم، فلا شاشة تحتاج الجدول نفسه.
revoke all on public.shift_windows from anon, authenticated;

-- الكتابة للمدير وحده. تعريف واحد لا غير — تعريفان يجعلان PostgREST يرفض
-- الاختيار بينهما ويسقط النداء كلّه (درس 0076 مع save_partner).
create or replace function public.save_shift_window(p_period text, p_start int, p_end int)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_period not in ('morning', 'evening') then raise exception 'unknown shift'; end if;
  if p_end <= p_start then raise exception 'end before start'; end if;
  insert into shift_windows(period, start_min, end_min, updated_at)
    values (p_period, p_start, p_end, now())
  on conflict (period) do update
    set start_min = excluded.start_min, end_min = excluded.end_min, updated_at = now();
end $fn$;

revoke all on function public.save_shift_window(text, int, int) from anon, public;
grant execute on function public.save_shift_window(text, int, int) to authenticated;
grant execute on function public.save_shift_window(text, int, int) to service_role;

notify pgrst, 'reload schema';
