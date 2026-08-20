-- 0009 — customer order tracking: anon-callable lookup of their own orders by
-- unguessable UUID (the same access-token pattern as loyalty card serials).
-- Returns safe fields only (no cost). Capped at 20 ids per call.
create or replace function public.get_orders_public(p_orders uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by (row->>'created_at')), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id,
      'order_seq', o.order_seq,
      'status', o.status,
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
