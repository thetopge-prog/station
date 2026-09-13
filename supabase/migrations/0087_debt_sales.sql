-- ═══ البيع بالدين من الكاشير، وتصحيح اسم «طلباتي» ═══
--
-- ما رآه المالك على الكاونتر: عمر يطلب، ويقول للكاشير «على حساب أحمد» —
-- أحمد يدفع اليوم أو غداً. كان الكاشير يبيع نقداً ثم يسجّل الدين يدوياً في
-- صفحة الديون، فيدخل الصندوقُ نقداً لم يُقبض. الآن طريقة دفع رابعة «دين»:
-- الطلب يُصدَر ويُطبخ، لا يدخل الصندوق، ويُسجَّل سطراً في الديون باسم من
-- سيدفع (cashier-actions.ts). سداده لاحقاً من صفحة الديون كما هو.

alter table public.orders drop constraint if exists orders_payment_method_chk;
alter table public.orders add constraint orders_payment_method_chk
  check (payment_method is null or payment_method in ('cash', 'card', 'partner', 'debt'));

-- شركة التوصيل اسمها «طلباتي» لا «طلبات» — يظهر على كل وصل وتذكرة
update public.delivery_partners set name_ar = 'طلباتي' where name_ar = 'طلبات';

-- رفع الهَب يقبل الدين طريقةً (0086 كان يردّها إلى «نقد»)
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
    payment_method = case when p_method in ('cash', 'card', 'partner', 'debt') then p_method else 'cash' end,
    partner_id = case when p_method = 'partner' then p_partner else null end,
    partner_cash_received = v_paid,
    partner_commission = v_comm,
    customer_id = coalesce(p_customer, customer_id),
    session_id = coalesce(p_session, session_id)
  where id = p_id and status <> 'paid';

  return v_total;
end $$;

notify pgrst, 'reload schema';
