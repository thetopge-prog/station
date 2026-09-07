-- ═══ إدخال بتاريخ سابق: مصاريف · مشتريات · مبيعات يومية ═══
--
-- النظام يُعتمَد في منتصف الشهر، وأوّله جرى على الورق. صاحب المحل يريد أن
-- يُدخل ما صُرف وما اشتُري وما بيع في تلك الأيام بتواريخها، لا بتاريخ اليوم
-- — وإلا ظهر الشهر كله وكأنه بدأ يوم الاعتماد.

-- ── ١. المبيعات اليومية اليدوية ────────────────────────────────────────────
--
-- رقم واحد لكل يوم: نقد وبطاقة. لا طلبات مفصّلة — لم تُسجَّل يومها ولن تُخترع
-- الآن. ولا ربح: كلفة تلك الطلبات غير معروفة، واختراع ربح أسوأ من غيابه.
create table if not exists public.manual_daily_sales (
  business_day date primary key,
  cash int not null default 0 check (cash >= 0),
  card int not null default 0 check (card >= 0),
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.manual_daily_sales enable row level security;
-- تُقرأ وتُكتب عبر عميل الخدمة خلف بوّابة الإدارة في التطبيق؛ لا دور عام يراها
revoke all on public.manual_daily_sales from anon, authenticated;

-- ── ٢. الاستلام بتاريخ ──────────────────────────────────────────────────────
--
-- توقيع جديد ⇒ الدالة القديمة تُحذف أولاً، وإلا بقيت نسختان بالاسم نفسه
-- ورفض PostgREST الاختيار بينهما.
drop function if exists public.receive_stock(uuid, numeric, int, date, text, text);

create or replace function public.receive_stock(
  p_ingredient uuid,
  p_qty numeric,
  p_unit_cost int default 0,
  p_expiry date default null,
  p_supplier text default null,
  p_note text default null,
  p_received_on date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_batch uuid;
  v_shelf int;
  v_day date := coalesce(p_received_on, (now() at time zone 'Asia/Baghdad')::date);
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'quantity must be positive'; end if;
  if v_day > (now() at time zone 'Asia/Baghdad')::date then raise exception 'received_on in the future'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  -- مدة الصلاحية تُحسب من يوم الاستلام الفعلي، لا من اليوم
  if p_expiry is null then
    select default_shelf_days into v_shelf from ingredients where id = p_ingredient;
    if v_shelf is not null then p_expiry := v_day + v_shelf; end if;
  end if;

  insert into inventory_batches(ingredient_id, qty_received, qty_remaining, unit_cost, expiry_date, supplier, note, created_by, received_on)
    values (p_ingredient, p_qty, p_qty, greatest(0, coalesce(p_unit_cost, 0)), p_expiry,
            nullif(trim(coalesce(p_supplier, '')), ''), nullif(trim(coalesce(p_note, '')), ''), v_emp, v_day)
    returning id into v_batch;

  insert into stock_movements(ingredient_id, batch_id, delta, reason, note, created_by, business_day)
    values (p_ingredient, v_batch, p_qty, 'receive', nullif(trim(coalesce(p_supplier, '')), ''), v_emp, v_day);

  return v_batch;
end $$;

revoke all on function public.receive_stock(uuid, numeric, int, date, text, text, date) from public, anon;
grant execute on function public.receive_stock(uuid, numeric, int, date, text, text, date) to authenticated;

-- ── ٣. تقرير المدى يضمّ المبيعات اليدوية ───────────────────────────────────
--
-- نفس التوقيع ونفس الأعمدة؛ يتغيّر مصدر المبيعات فقط: طلبات + يدوي.
-- الربح من اليدوي صفر، وعدد الطلبات صفر — بصدق، لا بتقدير.
create or replace function public.range_summary(p_from date, p_to date)
returns table(day date, sales bigint, orders_count bigint, profit bigint,
              expenses bigint, net bigint)
language sql stable security definer set search_path = public as $fn$
  with s as (
    select business_day d,
           sum(subtotal - discount + extra)::bigint sales,
           count(*)::bigint cnt,
           sum(subtotal - discount + extra - cost_total)::bigint profit
      from orders
     where status = 'paid' and business_day between p_from and p_to
     group by business_day
  ), m as (
    select business_day d, (cash + card)::bigint sales
      from manual_daily_sales
     where business_day between p_from and p_to
  ), e as (
    select business_day d,
           sum(amount)::bigint expenses,
           sum(amount) filter (where coalesce(category, '') <> 'رواتب')::bigint expenses_no_wages
      from expenses
     where business_day between p_from and p_to
     group by business_day
  ), f as (
    select coalesce((select total from public.daily_fixed_cost()), 0)::bigint total
  )
  select g::date,
         coalesce(s.sales, 0) + coalesce(m.sales, 0),
         coalesce(s.cnt, 0),
         coalesce(s.profit, 0),
         coalesce(e.expenses, 0),
         coalesce(s.profit, 0) - coalesce(e.expenses_no_wages, 0) - (select total from f)
    from generate_series(p_from, p_to, interval '1 day') g
    left join s on s.d = g::date
    left join m on m.d = g::date
    left join e on e.d = g::date
   order by 1;
$fn$;

-- الصلاحيات كما ثبّتها 0060: للخدمة وحدها
revoke execute on function public.range_summary(date, date) from public, anon, authenticated;
grant execute on function public.range_summary(date, date) to service_role;

notify pgrst, 'reload schema';
