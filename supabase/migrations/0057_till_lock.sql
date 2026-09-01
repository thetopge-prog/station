-- قفل الصندوق السريع.
--
-- الكاشير يترك الشاشة مفتوحة ويبتعد. تسجيل الخروج يُنهي الوردية ويُغلق الدرج،
-- فلا أحد يفعله لأجل دقيقتين — والنتيجة أن أي مارّ يستطيع أن يضيف صنفاً إلى
-- طلب قائم باسم كاشير غائب.
--
-- فالقفل هنا يمنع ذلك: الشاشة تُغلق، والوردية تبقى مفتوحة كما هي.
--
-- وحدوده صريحة: هذا يمنع العابث لا المخترق. من يفتح أدوات المطوّر يتجاوزه،
-- لكن من يقف عند الكاونتر لا يستطيع — وهو الخطر المقصود.

create table if not exists public.till_pins (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  pin text not null check (pin ~ '^[0-9]{4,8}$'),
  updated_at timestamptz not null default now()
);

-- لا سياسة ولا صلاحية: الرمز لا يُقرأ من الجدول إطلاقاً، حتى بحساب المدير.
-- الدالتان أدناه وحدهما تلمسانه.
alter table public.till_pins enable row level security;
revoke all on public.till_pins from anon, authenticated;

/** الرمز الافتراضي حتى يغيّره الكاشير بنفسه. */
create or replace function public.till_pin_default() returns text
language sql immutable as $$ select '2468' $$;

/**
 * هل يفتح هذا الرمز الشاشة؟
 *
 * يقارن داخل القاعدة لا في المتصفح، فلا يصل الرمز الصحيح إلى الشاشة أبداً —
 * ولو وصل لقُرئ من مصدر الصفحة في ثانية.
 */
create or replace function public.verify_till_pin(p_pin text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(
    (select t.pin = p_pin
       from till_pins t
       join employees e on e.id = t.employee_id
      where e.auth_user_id = auth.uid() and e.is_active),
    p_pin = till_pin_default()  -- لم يغيّره بعد
  );
$$;

/** تغيير الرمز — ولا يُغيَّر إلا بمعرفة الحالي. */
create or replace function public.set_till_pin(p_current text, p_next text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not verify_till_pin(p_current) then return false; end if;
  if p_next !~ '^[0-9]{4,8}$' then
    raise exception 'الرمز يجب أن يكون من ٤ إلى ٨ أرقام.';
  end if;
  select e.id into v_id from employees e where e.auth_user_id = auth.uid() and e.is_active;
  if v_id is null then return false; end if;
  insert into till_pins (employee_id, pin) values (v_id, p_next)
    on conflict (employee_id) do update set pin = excluded.pin, updated_at = now();
  return true;
end $$;

grant execute on function public.verify_till_pin(text), public.set_till_pin(text, text) to authenticated;
