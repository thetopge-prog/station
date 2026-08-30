-- 0049_item_unavailable.sql — «الصنف نفد» بين يدي المجهّز.
--
-- الحالة التي لم يكن لها حل: المجهّز يجمع كيساً من ستة أصناف فينفد الجبن.
-- الزر الأخير مقفل حتى يؤشّر كل الأصناف، فأمامه ثلاثة خيارات كلها سيئة:
-- يترك الطلب معلّقاً على الشاشة إلى الأبد، أو يؤشّر صنفاً لم يضعه — أي يكذب
-- على النظام — أو يمشي إلى الكاشير ليلغي الطلب كاملاً.
--
-- الحل ليس زراً يخفي السطر، بل ثلاثة أشياء معاً: يخرج من العدّ، ويُخصم سعره،
-- ويعرف الكاشير أن عليه الاتصال بالزبون. الخصم بلا اتصال أسوأ من الاثنين: زبون
-- يصل كيسه ناقصاً ولا يعرف لماذا.

alter table public.order_items
  add column if not exists unavailable_at timestamptz;

alter table public.orders
  -- الكاشير ضغط «تم — اتصلت بالزبون». حتى تُضغط، يبقى التنبيه على الشاشة.
  add column if not exists shortage_ack_at timestamptz;

comment on column public.order_items.unavailable_at is
  'نفد أثناء التجهيز — يخرج من مجموع الطلب ولا يُطبع على أنه سُلّم.';

/**
 * تعليم صنف بأنه نفد، وإعادة حساب الطلب.
 *
 * المجاميع تُحسب من السطور الباقية لا بطرح رقم: الطرح يتراكم عليه الخطأ حين
 * ينفد صنفان، وإعادة الحساب لا تفعل.
 *
 * يعيد ما يحتاجه الكاشير للمكالمة: رقم الطلب، اسم الصنف، هاتف الزبون،
 * المجموع الجديد، وكم كان مدفوعاً — لأن طلباً دُفع ثمنه كاملاً يعني أن على
 * الكاشير أن يعيد فرقاً، لا أن يخصم فقط.
 */
create or replace function public.mark_item_unavailable(p_item uuid)
returns table(
  order_id uuid,
  order_seq int,
  item_name text,
  customer_phone text,
  customer_name text,
  new_total int,
  refund_due int
)
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid;
  v_was_paid boolean;
  v_old int;
  v_new int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;

  select oi.order_id into v_order from order_items oi where oi.id = p_item;
  if v_order is null then raise exception 'item not found'; end if;

  update order_items set unavailable_at = now() where id = p_item and unavailable_at is null;

  select (o.status = 'paid'), (o.subtotal - o.discount + o.extra)
    into v_was_paid, v_old
    from orders o where o.id = v_order;

  -- المجاميع من السطور الحيّة فقط
  update orders o set
    subtotal = (select coalesce(sum(oi.line_total), 0) from order_items oi
                 where oi.order_id = o.id and oi.unavailable_at is null),
    cost_total = (select coalesce(sum(oi.qty * oi.unit_cost), 0) from order_items oi
                   where oi.order_id = o.id and oi.unavailable_at is null),
    -- تنبيه جديد يُوقظ الكاشير حتى لو كان قد أقرّ تنبيهاً سابقاً على نفس الطلب
    shortage_ack_at = null
  where o.id = v_order;

  select (o.subtotal - o.discount + o.extra) into v_new from orders o where o.id = v_order;

  return query
    select o.id,
           o.order_seq,
           (select oi.name_ar from order_items oi where oi.id = p_item),
           o.customer_phone,
           o.customer_name,
           v_new,
           -- دُفع الثمن كاملاً؟ إذاً الفرق دَين على المحل لا خصم على ورق
           case when v_was_paid then greatest(0, v_old - v_new) else 0 end
      from orders o where o.id = v_order;
end $$;

/** الكاشير اتصل بالزبون وأبلغه — يختفي التنبيه. */
create or replace function public.ack_shortage(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  update orders set shortage_ack_at = now() where id = p_order;
end $$;

revoke all on function public.mark_item_unavailable(uuid) from public, anon;
revoke all on function public.ack_shortage(uuid) from public, anon;
grant execute on function public.mark_item_unavailable(uuid) to authenticated;
grant execute on function public.ack_shortage(uuid) to authenticated;

grant select (unavailable_at) on public.order_items to authenticated;
grant select (shortage_ack_at) on public.orders to authenticated;
