-- الجرد الموسّع — ومطابقته للتقرير المُرسَل.
--
-- شكوى صاحب المحل: «الجرد اليومي لا يطابق المرسل». والسبب كلمة واحدة برقمين:
--
--   الجرد   : الصافي = الأرباح − الكلفة الثابتة
--   المُرسَل : الصافي = الأرباح − المصاريف
--
-- ولا واحد منهما يطرح الاثنين. في يوم مصاريفه ٢٠٠ ألف وكلفته الثابتة ١٥٠ ألف
-- يطبع التقريران رقمين بينهما ٣٥٠ ألفاً، وكلاهما اسمه «الصافي».

-- ═══ ١. صافٍ واحد، في مكان واحد ═══
--
-- يُحسب داخل range_summary وحدها، فيقرؤه الجرد والبوت من المصدر نفسه ولا
-- يمكن أن يختلفا مهما تغيّر التعريف لاحقاً.
--
-- والرواتب لا تُطرح مرّتين: daily_fixed_cost يوزّع الراتب الشهري على أيام
-- الشهر (استحقاق يومي)، وصرف الراتب يُسجَّل مصروفاً بفئة «رواتب» (دفعة نقدية).
-- وهما المال نفسه مرّتين، فتُستثنى فئة الرواتب من المصاريف عند حساب الصافي —
-- وتبقى ظاهرة كاملةً في خانة المصاريف، لأنها نقد خرج من الدرج فعلاً.
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
         coalesce(s.sales, 0),
         coalesce(s.cnt, 0),
         coalesce(s.profit, 0),
         coalesce(e.expenses, 0),
         coalesce(s.profit, 0) - coalesce(e.expenses_no_wages, 0) - (select total from f)
    from generate_series(p_from, p_to, interval '1 day') g
    left join s on s.d = g::date
    left join e on e.d = g::date
   order by 1;
$fn$;

revoke execute on function public.range_summary(date, date) from authenticated, public;
grant execute on function public.range_summary(date, date) to service_role;

-- ═══ ٢. سلفة الموظف ═══
--
-- «حساب موظف» = سحب نقدي على الراتب. لم يكن في النظام مفهوم عنه إطلاقاً.
--
-- ولا جدول جديد له: السلفة **نقد يخرج من الدرج**، وهذا تعريف المصروف حرفياً.
-- فتُسجَّل مصروفاً بفئة «سلفة موظف» مع معرّف صاحبها — فترث مباشرةً كل ما بُني
-- أصلاً: تُطرح من النقد المتوقَّع، وتدخل تقرير الوردية، وتظهر في الصرفيات،
-- وتُقفل مع اليوم. جدول مستقل كان سيحتاج كل ذلك من جديد.
alter table public.expenses
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

comment on column public.expenses.employee_id is
  'صاحب السلفة حين تكون الفئة «سلفة موظف» — وإلا فارغ';

-- ═══ ٣. حساب كل شركة توصيل ليوم واحد ═══
--
-- لم تكن هناك أي دالة تعدّ طلبات شركة في يوم. الموجود:
--   partner_balances.orders_count → كل الأيام، بلا تاريخ
--   partner_ledger              → شركة واحدة، صفوفاً لا مجاميع
--
-- والملغى يُعرض منفصلاً لا مطروحاً: الطلب الملغى ليس مبيعة، لكنه حدث يجب أن
-- يُرى — ومنه يعرف صاحب المحل أي شركة تُلغي كثيراً.
create or replace function public.daily_partner_breakdown(p_day date)
returns table(
  partner_id uuid,
  name_ar text,
  orders_count int,
  sales bigint,
  cancelled_count int,
  cancelled_amount bigint,
  discounts bigint,
  balance bigint
) language sql stable security definer set search_path = public as $fn$
  select p.id,
         p.name_ar,
         count(*) filter (where o.status = 'paid')::int,
         coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.status = 'paid'), 0)::bigint,
         count(*) filter (where o.status in ('cancelled', 'refunded'))::int,
         coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.status in ('cancelled', 'refunded')), 0)::bigint,
         coalesce(sum(o.discount) filter (where o.status = 'paid'), 0)::bigint,
         coalesce((select b.balance from partner_balances b where b.id = p.id), 0)::bigint
    from delivery_partners p
    left join orders o on o.partner_id = p.id and o.business_day = p_day
   where p.is_active
   group by p.id, p.name_ar
   order by p.sort, p.name_ar;
$fn$;

revoke execute on function public.daily_partner_breakdown(date) from authenticated, public;
grant execute on function public.daily_partner_breakdown(date) to service_role;

-- ═══ ٤. الشركة لا تُحاسَب على طلب لم يُبَع ═══
--
-- partner_balances كان يرشّح `status <> 'cancelled'`، و'refunded' ليست
-- 'cancelled' — فالطلب المُرجَع يخرج من مبيعاتك (range_summary يرشّح = 'paid')
-- **ويبقى في فاتورة الشركة إلى الأبد**. كشف الحساب يطالبها بمال أُعيد للزبون،
-- ولا سبيل للتصحيح إلا تسوية يدوية تُسمّي نفسها كذباً «مبلغاً مستلَماً».
--
-- = 'paid' يطابق range_summary و session_report و bep_today — مصدر واحد للحقيقة.
-- drop لا replace: العرض لا يقبل تغيير أعمدته، ولا شيء يعتمد عليه (فحصتُ).
drop view if exists public.partner_balances;
create view public.partner_balances as
  select p.id,
         p.name_ar,
         p.is_active,
         p.phone,
         coalesce(o.billed, 0)::bigint    as billed,
         coalesce(s.settled, 0)::bigint   as settled,
         (coalesce(o.billed, 0) - coalesce(s.settled, 0))::bigint as balance,
         coalesce(o.orders_count, 0)::int as orders_count,
         o.last_order_at,
         s.last_settled_at
    from delivery_partners p
    left join (
      select partner_id,
             sum(subtotal - discount + extra) as billed,
             count(*)                         as orders_count,
             max(created_at)                  as last_order_at
        from orders
       where partner_id is not null and status = 'paid'
       group by partner_id
    ) o on o.partner_id = p.id
    left join (
      select partner_id, sum(amount) as settled, max(created_at) as last_settled_at
        from partner_settlements
       group by partner_id
    ) s on s.partner_id = p.id;

revoke all on public.partner_balances from anon, authenticated;
