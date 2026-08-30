-- 0048_stale_sessions.sql — وردية الأمس لا تمنع وردية اليوم.
--
-- ما حدث فعلاً: وردية فُتحت في 2026-08-20 بافتتاحي 25,000 ولم تُغلق أبداً.
-- وبعد أربعة أيام حاول المالك فتح وردية بـ50,000، فرفض النظام بـ
-- 'session already open'، وظهرت الرسالة بالإنجليزية الخام، وبقي الشريط يعرض
-- 25,000 القديمة. فبدا الأمر وكأن النظام «سجّل نصف المبلغ».
--
-- لا شيء في المنظومة كان يغلق وردية يوم مضى. الوردية ليست صفاً في جدول فقط،
-- بل نافذة زمنية: من فتح صندوقاً يوم الخميس لم يعد جالساً عليه يوم الاثنين.

/**
 * فتح وردية صندوق.
 *
 * الجديد: أي وردية مفتوحة من يوم عمل **سابق** تُغلق تلقائياً قبل الفتح، مع
 * ملاحظة تقول ذلك صراحةً حتى لا يبدو الإغلاق سحراً في التقارير.
 *
 * وردية اليوم نفسه تبقى مرفوضة — كاشيران على صندوق واحد في اليوم نفسه خطأ
 * بشري يجب أن يُرى، لا أن يُبتلع.
 */
create or replace function public.open_cashier_session(
  p_float int,
  p_from_session uuid default null,
  p_counted int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_id uuid;
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_stale int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  if v_emp is null then raise exception 'no employee record'; end if;

  -- ورديات الأيام الماضية: تُغلق بما هو معروف عنها، بلا اختراع أرقام.
  -- expected_cash يبقى كما هو (قد يكون فارغاً) لأن أحداً لم يعدّ الصندوق،
  -- وتزييف عدّ لم يحدث أسوأ من الاعتراف بأنه لم يحدث.
  update cashier_sessions
     set closed_at = now(),
         close_note = coalesce(nullif(close_note, ''), '') ||
                      case when coalesce(close_note, '') = '' then '' else ' · ' end ||
                      'أُغلقت تلقائياً — بقيت مفتوحة من يوم ' || business_day::text
   where cashier_id = v_emp
     and closed_at is null
     and business_day < v_day;
  get diagnostics v_stale = row_count;

  if exists (select 1 from cashier_sessions where cashier_id = v_emp and closed_at is null) then
    raise exception 'session already open';
  end if;

  -- confirming receipt closes out the predecessor's audit trail
  if p_from_session is not null then
    update cashier_sessions
       set handover_confirmed_at = now(),
           handover_counted = coalesce(p_counted, p_float)
     where id = p_from_session and handover_confirmed_at is null;
  end if;

  insert into cashier_sessions(cashier_id, opening_float, opened_from)
    values (v_emp, greatest(0, coalesce(p_float, 0)), p_from_session)
    returning id into v_id;
  return v_id;
end $$;

-- 0042 نظّف صلاحيات الدوال ونسي هاتين، فبقيتا تحملان منح PUBLIC الضمني الذي
-- كُتب ذلك الترحيل أصلاً لإزالته. is_staff() وحده كان يحرسهما.
revoke all on function public.open_cashier_session(int, uuid, int) from public, anon;
revoke all on function public.close_cashier_session(uuid, int, int, uuid, text) from public, anon;
grant execute on function public.open_cashier_session(int, uuid, int) to authenticated;
grant execute on function public.close_cashier_session(uuid, int, int, uuid, text) to authenticated;

-- مكالمة واتساب تصل باسم المتصل لا برقمه حين يكون محفوظاً في جهات الاتصال.
-- الاسم أفضل من لا شيء على شاشة الكاشير.
alter table public.incoming_calls
  add column if not exists caller_name text;
