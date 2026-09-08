-- ═══ ملاحظة على السطر، قناة «سفري»، وتجهيز الكل ═══
--
-- «بدون بصل» على برجر واحد من ثلاثة: كانت ملاحظة الطلب كلّه، وعلى الورق لا
-- يُعرف أيّ برجر. الآن السطر يحمل ملاحظته. و«سفري» قناة كاشير محلية الترقيم
-- (ليست في v_remote فلا تأخذ 9xx) تقول للمجهّز أن الزبون يستلم بنفسه.
-- وتجهيز الكل: تحديث واحد لعشرين طلباً بدل عشرين نداء.

-- أولاً في الملف: القيمة الجديدة لا تُقيَّم قبل الالتزام، وv_remote تُحسب عند النداء
alter type public.order_channel add value if not exists 'takeaway';

alter table public.order_items add column if not exists note text;

-- ── place_order v6: نسخة 0043 + ملاحظة السطر ──────────────────────────────
-- create or replace بالتوقيع نفسه — لا drop: النافذة بينهما تُسقط الـRPC من PostgREST
create or replace function public.place_order(
  p_channel public.order_channel,
  p_lines jsonb,
  p_customer uuid default null,
  p_table text default null,
  p_note text default null,
  p_phone text default null,
  p_address text default null,
  p_source text default 'pos',
  p_customer_name text default null
) returns table(order_id uuid, order_seq int, pickup_code text, table_no text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_seq int;
  v_order uuid;
  v_cashier uuid;
  v_expediter uuid;
  v_line jsonb;
  v_item public.menu_items;
  v_variant public.item_variants;
  v_qty int;
  v_price int;
  v_cost int;
  v_name text;
  v_flavor text;
  v_line_note text;
  v_code text;
  v_table text;
  v_remote boolean := p_channel in ('delivery', 'pickup', 'curbside');
  v_try int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order';
  end if;

  select e.id into v_cashier from employees e
    where e.auth_user_id = auth.uid() and e.is_active limit 1;

  v_expediter := public.current_expediter();

  v_table := nullif(trim(coalesce(p_table, '')), '');
  if v_table = '#auto' then
    perform pg_advisory_xact_lock(hashtext('station_table_claim'));
    select t.name into v_table
      from cafe_tables t
     where t.active and t.name not in (select public.busy_tables())
     order by t.sort, t.name
     limit 1;
    if v_table is null then
      p_note := trim(both ' ·' from coalesce(p_note, '') || ' · ⚠ لا توجد طاولة فارغة');
    end if;
  end if;

  if v_remote then
    insert into order_counters_remote(business_day, last_seq) values (v_day, 901)
      on conflict (business_day) do update set last_seq = order_counters_remote.last_seq + 1
      returning last_seq into v_seq;
  else
    insert into order_counters(business_day, last_seq) values (v_day, 1)
      on conflict (business_day) do update set last_seq = order_counters.last_seq + 1
      returning last_seq into v_seq;
  end if;

  loop
    v_try := v_try + 1;
    v_code := public.gen_pickup_code();
    exit when not exists (
      select 1 from orders o where o.business_day = v_day and o.pickup_code = v_code
    );
    if v_try > 25 then
      v_code := null;   -- never block a sale over a display code
      exit;
    end if;
  end loop;

  insert into orders(business_day, order_seq, channel, status, prep_status, customer_id, cashier_id,
                     expediter_id, table_no, note, pickup_code, customer_phone, address_note,
                     order_source, customer_name, source)
    values (v_day, v_seq, p_channel, 'pending', 'new', p_customer, v_cashier,
            v_expediter, v_table,
            nullif(left(trim(coalesce(p_note, '')), 300), ''),
            v_code,
            nullif(left(trim(coalesce(p_phone, '')), 20), ''),
            nullif(left(trim(coalesce(p_address, '')), 300), ''),
            case when p_source in ('pos', 'web', 'whatsapp') then p_source else 'pos' end,
            nullif(left(trim(coalesce(p_customer_name, '')), 120), ''),
            'cloud')
    returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_variant := null;
    v_qty := greatest(1, coalesce((v_line->>'qty')::int, 1));

    select * into v_item from menu_items where id = (v_line->>'item_id')::uuid and is_active;
    if not found then raise exception 'item not available: %', v_line->>'item_id'; end if;

    if nullif(v_line->>'variant_id', '') is not null then
      select * into v_variant from item_variants
        where id = (v_line->>'variant_id')::uuid and item_id = v_item.id and is_active;
      if not found then raise exception 'variant not available'; end if;
    end if;

    v_price := coalesce(v_variant.price_override, v_item.price);
    v_cost  := coalesce(v_variant.cost_override, v_item.cost);
    v_name  := v_item.name_ar || case when v_variant.id is not null then ' - ' || v_variant.name_ar else '' end;
    v_flavor := nullif(v_line->>'flavor', '');
    if v_flavor is not null and not (v_flavor = any(v_item.flavors)) then
      v_flavor := null;
    end if;
    -- الجديد: ملاحظة هذا السطر وحده («بدون بصل») — تُطبع تحت الصنف نفسه
    v_line_note := nullif(left(trim(coalesce(v_line->>'note', '')), 120), '');

    insert into order_items(order_id, item_id, variant_id, name_ar, flavor_ar, qty, unit_price, unit_cost, note)
      values (v_order, v_item.id, v_variant.id, v_name, v_flavor, v_qty, v_price, v_cost, v_line_note);
  end loop;

  update orders o set
    subtotal   = (select coalesce(sum(line_total), 0) from order_items where order_id = o.id),
    cost_total = (select coalesce(sum(qty * unit_cost), 0) from order_items where order_id = o.id)
    where o.id = v_order;

  return query select v_order, v_seq, v_code, v_table;
end $$;

-- ── تجهيز الكل — نفس محاسبة confirm_assembled (0032)، تحديث واحد ─────────
create or replace function public.confirm_assembled_many(p_orders uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_n int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  v_emp := coalesce(v_emp, public.current_expediter());

  update orders o
     set prep_status  = 'ready',
         expediter_id = coalesce(o.expediter_id, v_emp)
   where o.id = any(p_orders)
     and o.status <> 'cancelled'
     and o.prep_status in ('new', 'preparing');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.confirm_assembled_many(uuid[]) from anon, public;

notify pgrst, 'reload schema';
