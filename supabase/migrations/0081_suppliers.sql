-- ═══ شركات المشتريات: بيبسي، طاحونة السنابل، علوة السدة ═══
--
-- تُصرف لها مبالغ يومياً أو أسبوعياً، وكان المصروف يُسجَّل بتصنيف نصّي حرّ
-- فقط، فلا يُعرف كم صُرف لشركة بعينها ولا رقم مندوبها حين يتأخّر.
--
-- نفس شكل delivery_partners حرفياً (0045): الموظّف يقرأ القائمة ليختار منها،
-- والمدير وحده يكتب عبر دالة. ولا حذف — التعطيل فقط، لأن مصروفاً من الشهر
-- الماضي يجب أن يبقى يعرف لمن صُرف.

create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name_ar    text not null unique,
  phone1     text,
  phone2     text,
  is_active  boolean not null default true,
  sort       int not null default 0,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
  for select to authenticated using (public.is_staff());

create or replace function public.save_supplier(
  p_id uuid,
  p_name text,
  p_phone1 text default null,
  p_phone2 text default null,
  p_active boolean default true,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'name required'; end if;

  if p_id is null then
    insert into suppliers(name_ar, phone1, phone2, is_active, note)
      values (trim(p_name),
              nullif(trim(coalesce(p_phone1, '')), ''),
              nullif(trim(coalesce(p_phone2, '')), ''),
              p_active,
              nullif(trim(coalesce(p_note, '')), ''))
      returning id into v_id;
  else
    update suppliers
       set name_ar   = trim(p_name),
           phone1    = nullif(trim(coalesce(p_phone1, '')), ''),
           phone2    = nullif(trim(coalesce(p_phone2, '')), ''),
           is_active = p_active,
           note      = nullif(trim(coalesce(p_note, '')), '')
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'unknown supplier'; end if;
  end if;
  return v_id;
end $fn$;

revoke all on function public.save_supplier(uuid, text, text, text, boolean, text) from anon, public;
grant execute on function public.save_supplier(uuid, text, text, text, boolean, text) to authenticated;

-- ── المصروف يعرف شركته ──────────────────────────────────────────────────────
-- نفس شكل employee_id في 0061: مفتاح واحد يقبل الفراغ، وon delete set null
-- كي لا يختفي مصروف لأن الشركة حُذفت يوماً.
alter table public.expenses
  -- restrict لا set null: مصروف يفقد اسم من قبضه ليس مصروفاً مكتملاً، ولا
  -- شاشة تحذف مورّداً أصلاً — التعطيل هو الطريق.
  add column if not exists supplier_id uuid references public.suppliers(id) on delete restrict;
comment on column public.expenses.supplier_id is
  'شركة المشتريات التي صُرف لها المبلغ — فارغ مقبول، فليس كل مصروف لشركة.';
create index if not exists expenses_supplier_idx on public.expenses(supplier_id, business_day desc);

notify pgrst, 'reload schema';
