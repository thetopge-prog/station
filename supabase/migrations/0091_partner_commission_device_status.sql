-- ═══ عمولة الشركات في جرد الإدارة والبوت · حالة جهاز توترز · دمج قراءات الشاشة ═══

-- ── 1) العمولة: طلباتي 20٪ وتوترز 15٪ — تُخصم في جرد الإدارة والبوت فقط ─────
-- الشركة تقبض من الزبون سعرها (partner_total) وتحوّل لنا الباقي بعد عمولتها.
-- الكاشير لا يرى شيئاً من هذا (صفحة الشركات والجرد للمدير).
update public.delivery_partners set commission_pct = 15 where name_ar = 'توترز' and settlement = 'credit';
update public.delivery_partners set commission_pct = 20 where name_ar = 'طلباتي' and settlement = 'credit';

-- الأعمدة الجديدة في آخر العرض (create or replace يقبل الإضافة في النهاية فقط)
create or replace view public.partner_balances as
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
         s.last_settled_at,
         -- ما قبضته الشركة من الزبائن (سعرها حيث عُرف، وإلا سعرنا)
         coalesce(o.theirs, 0)::bigint as their_total,
         -- عمولتها المقدَّرة على ذلك
         (case when p.settlement = 'credit' then round(coalesce(o.theirs, 0) * coalesce(p.commission_pct, 0) / 100) else 0 end)::bigint as commission_est,
         -- ما يصلنا فعلاً بعد العمولة والتسويات
         (coalesce(o.theirs, 0)
          - (case when p.settlement = 'credit' then round(coalesce(o.theirs, 0) * coalesce(p.commission_pct, 0) / 100) else 0 end)
          - coalesce(s.settled, 0))::bigint as net_balance
    from delivery_partners p
    left join (
      select partner_id,
             sum(subtotal - discount + extra)                                  as billed,
             sum(coalesce(partner_total, subtotal - discount + extra))         as theirs,
             count(*)                                                          as orders_count,
             max(created_at)                                                   as last_order_at
        from orders
       where partner_id is not null and status = 'paid' and partner_cash_received is null
       group by partner_id
    ) o on o.partner_id = p.id
    left join (
      select partner_id, sum(amount) as settled, max(created_at) as last_settled_at
        from partner_settlements group by partner_id
    ) s on s.partner_id = p.id;
revoke all on public.partner_balances from anon, authenticated, public;
grant select on public.partner_balances to service_role;

-- الجرد اليومي: العمولة المقدَّرة للشركات الآجلة تُضاف إلى ما خُتم على الطلبات
create or replace function public.daily_partner_breakdown(p_day date)
returns table(
  partner_id uuid, name_ar text, orders_count int, sales bigint, cancelled_count int, cancelled_amount bigint,
  discounts bigint, balance bigint, settlement text, cash_received bigint, commission bigint, partner_total bigint
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
         (coalesce(sum(o.partner_commission) filter (where o.status = 'paid'), 0)
          + case when p.settlement = 'credit'
                 then round(coalesce(sum(coalesce(o.partner_total, o.subtotal - o.discount + o.extra)) filter (where o.status = 'paid'), 0) * coalesce(p.commission_pct, 0) / 100)
                 else 0 end)::bigint,
         coalesce(sum(coalesce(o.partner_total, o.subtotal - o.discount + o.extra)) filter (where o.status = 'paid'), 0)::bigint
    from delivery_partners p
    left join orders o on o.partner_id = p.id and o.business_day = p_day
   where p.is_active
   group by p.id, p.name_ar, p.settlement, p.commission_pct
   order by p.sort, p.name_ar;
$fn$;
revoke execute on function public.daily_partner_breakdown(date) from anon, authenticated, public;
grant execute on function public.daily_partner_breakdown(date) to service_role;

-- ── 2) حالة جهاز توترز/طلباتي: نبضة كل ربع ساعة من التطبيق ─────────────────
-- الكاشير يرى «الجهاز لا يتصل منذ …» أو «قراءة الشاشة مطفأة» بدل أن يكتشفها
-- من طلب لم يصل.
create table if not exists public.device_status (
  id text primary key,
  seen_at timestamptz not null default now(),
  acc_enabled boolean,
  notif_enabled boolean,
  app_version text
);
alter table public.device_status enable row level security;
revoke all on public.device_status from anon, authenticated;

-- ── 3) قراءات الشاشة تُدمج: كل قراءة تحمل ما ظهر منها، والطلب يكتمل بمجموعها ──
alter table public.external_order_alerts add column if not exists items jsonb;

-- ── 4) سجلّ التشخيص يحفظ الشاشة كاملة لا ٦٠٠ حرف ─────────────────────────
create or replace function public.log_webhook(p_route text, p_status int, p_body text, p_note text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  insert into webhook_log(route, status, body, note) values (p_route, p_status, left(p_body, 6000), p_note);
  -- بحسب المسار لا عالمياً (0059)
  delete from webhook_log where id in (
    select id from (
      select id, row_number() over (partition by route order by id desc) rn from webhook_log
    ) t where t.rn > 40
  );
end $fn$;
revoke all on function public.log_webhook(text, int, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
