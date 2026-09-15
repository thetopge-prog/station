-- ═══ الزبون يلغي طلبه بنفسه — حتى يبدأ المطبخ ═══
--
-- الزبون على واتساب يعدّل رسالته بعد الطلب فيقرؤها الكاشير متأخراً أو لا
-- يقرؤها. الآن التعديل من صفحة التأكيد على هاتفه: يلغي ويعيد الطلب ما دام
-- الطلب معلّقاً ولم يُلمس في المطبخ. بعد ذلك يُرفض ويُقال له «اتصل بالمطعم».
--
-- الأمان كما في get_orders_public (0009): معرّف الطلب uuid لا يُخمَّن، ومن
-- يحمله هو من أنشأه على هذا الهاتف. لا يمسّ طلباً مدفوعاً أو بدأ تجهيزه.

create or replace function public.cancel_my_order(p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_prep text;
begin
  select status::text, prep_status::text into v_status, v_prep from orders where id = p_order;
  if v_status is null then return 'gone'; end if;
  if v_status = 'cancelled' then return 'cancelled'; end if;
  if v_status <> 'pending' or v_prep <> 'new' then return 'started'; end if;
  update orders set status = 'cancelled' where id = p_order and status = 'pending' and prep_status = 'new';
  return case when found then 'cancelled' else 'started' end;
end $$;

grant execute on function public.cancel_my_order(uuid) to anon, authenticated;

-- صفحة التأكيد تحتاج أن تعرف هل بدأ التجهيز — prep_status يُضاف إلى ما يُعاد
create or replace function public.get_orders_public(p_orders uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by (row->>'created_at')), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id,
      'order_seq', o.order_seq,
      'status', o.status,
      'prep_status', o.prep_status,
      'table_no', o.table_no,
      'subtotal', o.subtotal,
      'discount', o.discount,
      'created_at', o.created_at,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name_ar', i.name_ar, 'flavor_ar', i.flavor_ar, 'qty', i.qty,
          'unit_price', i.unit_price, 'line_total', i.line_total
        )), '[]'::jsonb)
        from order_items i where i.order_id = o.id
      )
    ) as row
    from orders o
    where o.id = any (p_orders[1:20])
  ) s;
$$;

notify pgrst, 'reload schema';
