-- ═══ الصندوق واحد للمحل، والدالة كانت تحسبه واحداً لكل كاشير ═══
--
-- 0059 غيّر الفهرس إلى وردية واحدة **للمحل**:
--   cashier_sessions_one_open_shop on cashier_sessions((true)) where closed_at is null
-- ولم يُغيّر open_cashier_session معه. وحارسها بقي لكل شخص:
--   if exists (... where cashier_id = v_emp and closed_at is null)
--
-- فكاشير ثانٍ يمرّ من الحارس (لا وردية له)، ثم يصطدم بالفهرس، فيقرأ على شاشة
-- المحل: duplicate key value violates unique constraint
-- "cashier_sessions_one_open_shop" — بالإنكليزية، وباسم فهرس. صوّرها صاحب
-- المحل مرّتين، بمبلغين مختلفين، لأن الرسالة لا تقول إن المبلغ ليس السبب.
--
-- وأسوأ من الرسالة: الإغلاق التلقائي للورديات المنسيّة كان هو الآخر لكل شخص
-- (where cashier_id = v_emp)، فوردية متروكة من يوم مضى باسم كاشير لا يعود
-- تُقفل الصندوق على **الجميع** إلى الأبد. لا أحد يستطيع فتح وردية، ولا أحد
-- يستطيع إغلاق تلك.

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
  v_holder uuid;
  v_holder_name text;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  if v_emp is null then raise exception 'no employee record'; end if;

  -- ورديات الأيام الماضية: تُغلق بما هو معروف عنها، بلا اختراع أرقام.
  -- expected_cash يبقى كما هو (قد يكون فارغاً) لأن أحداً لم يعدّ الصندوق،
  -- وتزييف عدّ لم يحدث أسوأ من الاعتراف بأنه لم يحدث.
  --
  -- ولأي كاشير كان، لا لي وحدي: الصندوق واحد، فوردية أمس المنسيّة تسدّه على
  -- كل من يأتي بعدها. كانت هذه أخطر نصف سطر في الملف.
  update cashier_sessions
     set closed_at = now(),
         close_note = coalesce(nullif(close_note, ''), '') ||
                      case when coalesce(close_note, '') = '' then '' else ' · ' end ||
                      'أُغلقت تلقائياً — بقيت مفتوحة من يوم ' || business_day::text
   where closed_at is null
     and business_day < v_day;

  -- الحارس على مستوى المحل، لأن الفهرس كذلك. والرسالة تقول من يحمل الصندوق:
  -- «مفتوحة» وحدها تُرسل الكاشير يبحث في شاشته، والاسم يُرسله إلى زميله.
  select s.cashier_id, e.name_ar into v_holder, v_holder_name
    from cashier_sessions s
    join employees e on e.id = s.cashier_id
   where s.closed_at is null
   limit 1;

  if v_holder = v_emp then
    raise exception 'session already open';
  elsif v_holder is not null then
    raise exception 'drawer held by %', v_holder_name;
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

revoke all on function public.open_cashier_session(int, uuid, int) from public, anon;
grant execute on function public.open_cashier_session(int, uuid, int) to authenticated;

notify pgrst, 'reload schema';
