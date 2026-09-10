-- ═══ «duplicate key … orders_business_day_order_seq_key» عند قبول طلب قديم ═══
--
-- mark_order_paid (0059) ينقل الطلب إلى يوم العمل الحالي عند الدفع، بحقّ:
-- طلبٌ سُجّل ٢٣:٥٢ ودُفع ٠٠:٠٦ نقدُه في درج اليوم لا في درج أمس. لكنه كان
-- ينقل اليوم ويُبقي الرقم، ورقم الطلب فريد داخل اليوم الواحد.
--
-- فطلب توصيل من أمس رقمه 901، حين يُقبل اليوم يصير (اليوم, 901) — واليوم فيه
-- 901 أصلاً، لأن عدّاد الطلبات البعيدة يبدأ من 901 كل يوم. فيسقط القبول
-- بالرسالة أعلاه. ستّة طلبات توترز عالقة في المطعم بسببها.
--
-- العلاج: حين يتغيّر اليوم، يُسحب رقم جديد من عدّاد اليوم الجديد — من عدّاد
-- الطلبات البعيدة إن كانت قناته بعيدة، وإلا من العدّاد المحلي. وهو ما يتوقّعه
-- الموظّف أيضاً: طلبٌ يُحاسَب اليوم يحمل رقم اليوم.

create or replace function public.mark_order_paid(
  p_order uuid, p_discount integer default 0, p_customer uuid default null,
  p_award_points integer default 0, p_extra integer default 0, p_extra_note text default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_seq int; v_cust uuid; v_sub int; v_disc int;
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_old_day date; v_channel public.order_channel; v_remote boolean;
begin
  if not public.is_role('cashier') then raise exception 'not authorized'; end if;

  select subtotal, business_day, channel
    into v_sub, v_old_day, v_channel
    from orders where id = p_order and status = 'pending';
  if v_sub is null then raise exception 'order not pending'; end if;

  -- الخصم لا يتجاوز المجموع (0059).
  v_disc := least(greatest(0, coalesce(p_discount, 0)), v_sub);

  -- يوم جديد ⇒ رقم جديد من عدّاد ذلك اليوم. نفس اليوم ⇒ الرقم كما هو.
  if v_old_day is distinct from v_day then
    v_remote := v_channel in ('delivery', 'pickup', 'curbside');
    if v_remote then
      insert into order_counters_remote(business_day, last_seq) values (v_day, 901)
        on conflict (business_day) do update set last_seq = order_counters_remote.last_seq + 1
        returning last_seq into v_seq;
    else
      insert into order_counters(business_day, last_seq) values (v_day, 1)
        on conflict (business_day) do update set last_seq = order_counters.last_seq + 1
        returning last_seq into v_seq;
    end if;
  end if;

  update orders set
    status = 'paid', paid_at = now(),
    discount = v_disc,
    extra = greatest(0, coalesce(p_extra, 0)),
    extra_note = nullif(trim(coalesce(p_extra_note, '')), ''),
    customer_id = coalesce(p_customer, customer_id),
    business_day = v_day,
    order_seq = coalesce(v_seq, order_seq)
    where id = p_order and status = 'pending'
    returning order_seq, customer_id into v_seq, v_cust;
  if not found then raise exception 'order not pending'; end if;

  if v_cust is not null and coalesce(p_award_points, 0) > 0 then
    insert into loyalty_events(customer_id, order_id, delta, reason)
      values (v_cust, p_order, p_award_points, 'earn_order')
      on conflict (order_id) where reason = 'earn_order' do nothing;
  end if;
  return v_seq;
end $fn$;

notify pgrst, 'reload schema';
