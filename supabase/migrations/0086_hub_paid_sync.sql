-- ═══ بيع الكاشير بلا إنترنت: رفع الدفع من الهَب ═══
--
-- الهَب (0044) كان يرفع الطلب معلّقاً فقط — طلبات QR والتوصيل. بيع الكاشير
-- مدفوعٌ لحظة صدوره، فيحتاج الرفع أن يختم الدفع أيضاً: الحالة، الخصم،
-- الإضافات، طريقة الدفع، الشركة وحصّتها، الوردية، الزبون.
--
-- لا يُعاد استعمال mark_order_paid: تشترط جلسة كاشير (auth.uid) والهَب يرفع
-- بمفتاح الخدمة. ولا تنقل الطلب إلى يوم اليوم: البيع وقع يوم وقع، والرقم الذي
-- طُبع على الوصل يبقى (sync_hub_order يضمنه).
--
-- المال يُحسب هنا من subtotal الذي أعاد sync_hub_order حسابه من المنيو الحيّ —
-- الهَب لا يرسل مبلغاً، يرسل الوقائع فقط. الحصّة الشركة كما في stampPayment:
--   cash_at_pickup: العمولة = نسبة من الإجمالي، والمقبوض = الباقي
--   custom (زاد):   المقبوض = ما كتبه الكاشير، وإلا الإجمالي ناقص أجرة التوصيل
--
-- متكرّرة بأمان: طلب مدفوع أصلاً يعود كما هو.

create or replace function public.sync_hub_payment(
  p_id uuid,
  p_paid_at timestamptz,
  p_discount int default 0,
  p_extra int default 0,
  p_extra_note text default null,
  p_method text default 'cash',
  p_partner uuid default null,
  p_partner_cash int default null,
  p_customer uuid default null,
  p_session uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_sub int; v_status text; v_disc int; v_total int;
  v_settlement text; v_pct numeric; v_fee int;
  v_paid int; v_comm int;
begin
  select subtotal, status into v_sub, v_status from orders where id = p_id;
  if v_sub is null then raise exception 'order % not found', p_id; end if;
  if v_status = 'paid' then
    return greatest(0, v_sub - (select discount from orders where id = p_id) + (select extra from orders where id = p_id));
  end if;

  v_disc := least(greatest(0, coalesce(p_discount, 0)), v_sub);
  v_total := greatest(0, v_sub - v_disc + greatest(0, coalesce(p_extra, 0)));

  if p_method = 'partner' and p_partner is not null then
    select settlement, commission_pct, delivery_fee into v_settlement, v_pct, v_fee
      from delivery_partners where id = p_partner;
    if v_settlement = 'cash_at_pickup' then
      v_comm := round(v_total * coalesce(v_pct, 0) / 100);
      v_paid := greatest(0, v_total - v_comm);
    elsif v_settlement = 'custom' then
      v_paid := case when p_partner_cash is null
                     then greatest(0, v_total - greatest(0, coalesce(v_fee, 0)))
                     else least(v_total, greatest(0, p_partner_cash)) end;
      v_comm := v_total - v_paid;
    end if;
  end if;

  update orders set
    status = 'paid',
    paid_at = coalesce(p_paid_at, now()),
    discount = v_disc,
    extra = greatest(0, coalesce(p_extra, 0)),
    extra_note = nullif(trim(coalesce(p_extra_note, '')), ''),
    payment_method = case when p_method in ('cash', 'card', 'partner') then p_method else 'cash' end,
    partner_id = case when p_method = 'partner' then p_partner else null end,
    partner_cash_received = v_paid,
    partner_commission = v_comm,
    customer_id = coalesce(p_customer, customer_id),
    session_id = coalesce(p_session, session_id)
  where id = p_id and status <> 'paid';

  return v_total;
end $$;

revoke all on function public.sync_hub_payment(uuid, timestamptz, int, int, text, text, uuid, int, uuid, uuid) from public, anon, authenticated;
grant execute on function public.sync_hub_payment(uuid, timestamptz, int, int, text, text, uuid, int, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
