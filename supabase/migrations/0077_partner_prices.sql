-- ═══ ثلاثة أرقام لكل طلب شركة: سعرنا، سعر الشركة، ما دفعناه لها ═══
--
-- صاحب المحل: أسعار الشركات ونسبها لا تدخل حساباتنا، لكن يجب أن تُرى.
-- لا عمود جديد على الطلب: partner_total (0073) يحمل سعر الشركة،
-- وpartner_commission (0068) يحمل ما ذهب للشركة — للشركة «المخصّصة» (زاد)
-- هو أجرة التوصيل التي ندفعها عن الطلب في مناطق التوصيل المجاني.
-- delivery_partners.delivery_fee (0054، لم تُستعمل قط) تصير الافتراضي لخانة
-- «دفع المندوب الآن» = الإجمالي ناقصها؛ حيث يدفع الزبون الأجرة للمندوب
-- يكتب الكاشير الإجمالي كاملاً فتصير صفراً.

comment on column public.delivery_partners.delivery_fee is
  'أجرة التوصيل التي ندفعها للشركة عن الطلب (زاد). الافتراضي لخانة «دفع المندوب الآن»: الإجمالي ناقصها. صفر = لا شيء.';

-- ── كشف الذمم يحمل الأجرة ليُملأ نموذج التعديل منها ───────────────────────
-- drop لا replace: العرض يكتسب عموداً. daily_partner_breakdown تقرأه بالاسم
-- وقت التنفيذ فلا تتأثر بإسقاطه.
drop view if exists public.partner_balances;
create view public.partner_balances as
  select p.id,
         p.name_ar,
         p.is_active,
         p.phone,
         p.settlement,
         p.commission_pct,
         p.delivery_fee,
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

-- ── كشف الشركة: صفّ الطلب يحمل الأرقام الثلاثة ─────────────────────────────
-- status = 'paid' لا <> 'cancelled': منذ 0073 يُنشأ طلب الشركة «معلّقاً» قبل
-- القبول، فكان يظهر في الكشف وفي «صافي الفترة» قبل أن يُباع، والمُرجَع يبقى
-- فيه للأبد. (0061 أصلح partner_balances بالطريقة نفسها.)
drop function if exists public.partner_ledger(uuid, date, date);
create function public.partner_ledger(p_partner uuid, p_from date default null, p_to date default null)
returns table(kind text, ref uuid, at timestamptz, label text, amount int,
              partner_total int, commission int, cash_received int)
language sql stable security definer set search_path = public as $$
  select 'order'::text, o.id, o.created_at, 'طلب #' || lpad(o.order_seq::text, 3, '0'),
         (o.subtotal - o.discount + o.extra)::int,
         o.partner_total, o.partner_commission, o.partner_cash_received
    from orders o
   where o.partner_id = p_partner and o.status = 'paid'
     and (p_from is null or o.business_day >= p_from)
     and (p_to   is null or o.business_day <= p_to)
  union all
  select 'settlement'::text, s.id, s.created_at,
         coalesce(s.note, case s.method when 'cash' then 'تسوية نقدية' when 'transfer' then 'حوالة' else 'تسوية' end),
         -s.amount, null, null, null
    from partner_settlements s
   where s.partner_id = p_partner
     and (p_from is null or s.business_day >= p_from)
     and (p_to   is null or s.business_day <= p_to)
   order by 3 desc
$$;
revoke all on function public.partner_ledger(uuid, date, date) from anon, public;
grant execute on function public.partner_ledger(uuid, date, date) to authenticated;

-- ── جرد اليوم: مجموع سعر الشركة إلى جانب مبيعاتنا ──────────────────────────
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
  commission bigint,
  partner_total bigint
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
         coalesce(sum(o.partner_commission) filter (where o.status = 'paid'), 0)::bigint,
         coalesce(sum(o.partner_total) filter (where o.status = 'paid'), 0)::bigint
    from delivery_partners p
    left join orders o on o.partner_id = p.id and o.business_day = p_day
   where p.is_active
   group by p.id, p.name_ar, p.settlement
   order by p.sort, p.name_ar;
$fn$;
-- الإنشاء من جديد يعيد المنح الافتراضي للعامّة (درس 0070) — يُغلق ثانيةً
revoke execute on function public.daily_partner_breakdown(date) from anon, authenticated, public;
grant execute on function public.daily_partner_breakdown(date) to service_role;

notify pgrst, 'reload schema';
