-- 0029_table_cleaning.sql — the cleaning crew's mobile flow: scan the table QR
-- that /qr already prints, mark it available again.

alter table public.cafe_tables
  add column if not exists clean_status text not null default 'clean',
  add column if not exists cleaned_at timestamptz,
  add column if not exists cleaned_by uuid references public.employees(id) on delete set null;

do $$ begin
  alter table public.cafe_tables
    add constraint cafe_tables_clean_chk check (clean_status in ('clean', 'dirty'));
exception when duplicate_object then null; end $$;

create or replace function public.mark_table_clean(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  update cafe_tables
     set clean_status = 'clean', cleaned_at = now(), cleaned_by = v_emp
   where name = p_name;
  if not found then raise exception 'unknown table: %', p_name; end if;
end $$;

-- A paid dine-in order dirties its table; the crew clears it from /clean.
create or replace function public.mark_table_dirty(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  update cafe_tables set clean_status = 'dirty' where name = p_name;
end $$;

revoke execute on function public.mark_table_clean(text) from anon;
revoke execute on function public.mark_table_dirty(text) from anon;
