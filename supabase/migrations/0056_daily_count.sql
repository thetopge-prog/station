-- 0056 — الجرد اليومي.
--
-- في المحل ورقة تُملأ آخر الليل: كم بعنا، كم في الدرج، كم صعد للإدارة، وكم
-- الفرق. النظام يعرف كل ذلك مفرّقاً في خمس شاشات، ولم يكن يجمعه في ورقة واحدة
-- تُطبع وتُوقَّع وتُراجَع بعد شهر.

create table if not exists public.daily_counts (
  business_day date primary key,
  counted_cash int not null default 0 check (counted_cash >= 0),
  deposited    int not null default 0 check (deposited >= 0),
  note         text,
  /*
   * الأرقام كما كانت لحظة الإقفال.
   *
   * تقرير يتغيّر كلما فُتح ليس تقريراً. الورقة المطبوعة يجب أن تطابق ما يعرضه
   * النظام بعد شهر — وأسعار الأصناف وتكاليفها تتغيّر، فإعادة الحساب لاحقاً
   * تعطي رقماً آخر لليوم نفسه.
   */
  snapshot     jsonb,
  closed_at    timestamptz,
  by_employee  uuid references public.employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.daily_counts is
  'جرد آخر اليوم: النقد المعدود والمودع وملاحظة، مع لقطة أرقام اليوم كما كانت.';

alter table public.daily_counts enable row level security;
revoke all on public.daily_counts from public, anon;
grant select on public.daily_counts to authenticated;

drop policy if exists daily_counts_read on public.daily_counts;
create policy daily_counts_read on public.daily_counts
  for select to authenticated using (public.is_staff());

/**
 * حفظ الجرد — إنشاءً أو تعديلاً.
 *
 * الأرقام المحسوبة تُمرَّر لقطةً ولا تُعاد حوسبتها هنا: الخادم هو من حسبها،
 * وهذه الدالة تحفظ ما رآه من وقّع الورقة.
 *
 * ولا تُعدَّل بعد الإقفال. جردٌ يُعاد فتحه وتغييره ليس جرداً.
 */
create or replace function public.save_daily_count(
  p_day date,
  p_counted int,
  p_deposited int,
  p_note text,
  p_snapshot jsonb,
  p_close boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;

  if exists (select 1 from daily_counts where business_day = p_day and closed_at is not null) then
    raise exception 'day already closed';
  end if;

  select e.id into v_emp from employees e where e.auth_user_id = auth.uid();

  insert into daily_counts (business_day, counted_cash, deposited, note, snapshot, by_employee,
                            closed_at, updated_at)
    values (p_day, greatest(0, coalesce(p_counted, 0)), greatest(0, coalesce(p_deposited, 0)),
            nullif(trim(coalesce(p_note, '')), ''), p_snapshot, v_emp,
            case when p_close then now() else null end, now())
  on conflict (business_day) do update
    set counted_cash = excluded.counted_cash,
        deposited    = excluded.deposited,
        note         = excluded.note,
        snapshot     = excluded.snapshot,
        by_employee  = excluded.by_employee,
        closed_at    = excluded.closed_at,
        updated_at   = now();
end $$;

revoke all on function public.save_daily_count(date, int, int, text, jsonb, boolean) from public, anon;
grant execute on function public.save_daily_count(date, int, int, text, jsonb, boolean) to authenticated;

/** قيمة المخزون الآن — الرقم الوحيد في الجرد الذي لم يكن يُحسب في أي مكان. */
create or replace function public.stock_value()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(on_hand * avg_unit_cost), 0)::int from stock_status;
$$;

revoke all on function public.stock_value() from public, anon;
grant execute on function public.stock_value() to authenticated;
