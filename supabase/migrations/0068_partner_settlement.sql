-- ═══ شركات التوصيل: آليتان للدفع لا واحدة ═══
--
-- كانت كل شركة «على الحساب»: الطلب يُقيَّد عليها وتُسوّي لاحقاً. وشركة زاد
-- تعمل بغير ذلك: المندوب يدفع للكاشير الإجمالي ناقص عمولتها نقداً عند
-- الاستلام — ١٠٬٠٠٠ على الزبون، ٩٬٠٠٠ في الدرج، ولا ذمّة.
--
-- فلكل شركة طريقة تسوية ونسبة عمولة، ولكل طلب نقديّ ما دخل الدرج فعلاً وما
-- ذهب عمولةً. الدرج المتوقّع يضمّ ما دخل، وكشف الذمم يحسب الشركات الآجلة وحدها.

alter table public.delivery_partners
  add column if not exists settlement text not null default 'credit'
    check (settlement in ('credit', 'cash_at_pickup'));
alter table public.delivery_partners
  add column if not exists commission_pct numeric(5,2) not null default 0
    check (commission_pct >= 0 and commission_pct <= 100);

-- على الطلب: فارغان لكل طلب ليس نقدياً عند الاستلام
alter table public.orders add column if not exists partner_cash_received int check (partner_cash_received >= 0);
alter table public.orders add column if not exists partner_commission int check (partner_commission >= 0);

-- ── الدرج المتوقّع يضمّ ما دفعه المندوب ────────────────────────────────────
-- نفس التوقيع ونفس الأعمدة (0059)؛ يتغيّر مصدر النقد فقط.
create or replace function public.session_report(p_session uuid)
returns table(opening_float integer, cash_sales integer, card_sales integer, orders_count integer,
              expenses_total integer, deposited integer, debts_issued integer, expected_cash integer)
language plpgsql stable security definer set search_path = public as $fn$
declare v_s public.cashier_sessions;
begin
  select * into v_s from cashier_sessions where id = p_session;
  if not found then raise exception 'unknown session'; end if;
  if v_s.cashier_id is distinct from public.me_employee() and not public.is_admin() then
    raise exception 'not your session';
  end if;

  select
    v_s.opening_float,
    (coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.payment_method = 'cash'), 0)
     + coalesce(sum(o.partner_cash_received) filter (where o.payment_method = 'partner'), 0))::int,
    coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.payment_method = 'card'), 0)::int,
    count(o.id)::int
  into opening_float, cash_sales, card_sales, orders_count
  from orders o where o.session_id = p_session and o.status = 'paid';

  select coalesce(sum(e.amount), 0)::int into expenses_total from expenses e where e.session_id = p_session;
  select coalesce(sum(d.amount) filter (where d.kind = 'debit'), 0)::int into debts_issued
    from debt_entries d where d.session_id = p_session;

  deposited := v_s.deposited;
  expected_cash := opening_float + cash_sales - expenses_total - v_s.deposited;
  return next;
end $fn$;

-- ── كشف الذمم: الشركات الآجلة وحدها ───────────────────────────────────────
-- الطلب النقديّ يحمل partner_cash_received، فلا يدخل «المقيَّد».
-- drop لا replace: العرض يكتسب عمودين.
drop view if exists public.partner_balances;
create view public.partner_balances as
  select p.id,
         p.name_ar,
         p.is_active,
         p.phone,
         p.settlement,
         p.commission_pct,
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
       where partner_id is not null and status = 'paid' and partner_cash_received is null
       group by partner_id
    ) o on o.partner_id = p.id
    left join (
      select partner_id, sum(amount) as settled, max(created_at) as last_settled_at
        from partner_settlements
       group by partner_id
    ) s on s.partner_id = p.id;
revoke all on public.partner_balances from anon, authenticated;

-- ── جرد اليوم: للشركة النقدية «استُلم نقداً» لا «مستحقّ» ─────────────────
drop function if exists public.daily_partner_breakdown(date);
create function public.daily_partner_breakdown(p_day date)
returns table(
  partner_id uuid,
  name_ar text,
  orders_count int,
  sales bigint,
  cancelled_count int,
  cancelled_amount bigint,
  discounts bigint,
  balance bigint,
  settlement text,
  cash_received bigint,
  commission bigint
) language sql stable security definer set search_path = public as $fn$
  select p.id,
         p.name_ar,
         count(*) filter (where o.status = 'paid')::int,
         coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.status = 'paid'), 0)::bigint,
         count(*) filter (where o.status in ('cancelled', 'refunded'))::int,
         coalesce(sum(o.subtotal - o.discount + o.extra) filter (where o.status in ('cancelled', 'refunded')), 0)::bigint,
         coalesce(sum(o.discount) filter (where o.status = 'paid'), 0)::bigint,
         coalesce((select b.balance from partner_balances b where b.id = p.id), 0)::bigint,
         p.settlement,
         coalesce(sum(o.partner_cash_received) filter (where o.status = 'paid'), 0)::bigint,
         coalesce(sum(o.partner_commission) filter (where o.status = 'paid'), 0)::bigint
    from delivery_partners p
    left join orders o on o.partner_id = p.id and o.business_day = p_day
   where p.is_active
   group by p.id, p.name_ar, p.settlement
   order by p.sort, p.name_ar;
$fn$;
revoke execute on function public.daily_partner_breakdown(date) from authenticated, public;
grant execute on function public.daily_partner_breakdown(date) to service_role;

notify pgrst, 'reload schema';
