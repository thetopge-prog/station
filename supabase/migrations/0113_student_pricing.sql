-- تسعير الطالب داخل place_order.
--
-- السعر يُحسب على الخادم ولا يُصدَّق ما يرسله المتصفّح — وهي قاعدة هذه الدالّة
-- منذ 0007. فامتدادُها للطلاب امتدادٌ لنفس الحارس: يُمرَّر معرّف الطالب، وتُقرأ
-- **حالته من القاعدة**، ولا يُسعَّر تسعيرَ الطلاب إلا من حالته `active`.
--
-- ورابطٌ مسرَّب لا يكفي: الرمز يفتح الصفحة، والقبول وحده يفتح السعر.
--
-- بُنيت هذه النسخة من تعريف الدالّة الحيّ (pg_get_functiondef) لا بالنسخ من
-- ترحيلٍ قديم — فما فيها من منطقٍ سابق (الطاولة التلقائية، رمز الاستلام،
-- قطع الليل 02:30) هو نفسه حرفاً بحرف.


CREATE OR REPLACE FUNCTION public.place_order(p_channel order_channel, p_lines jsonb, p_customer uuid DEFAULT NULL::uuid, p_table text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_source text DEFAULT 'pos'::text, p_customer_name text DEFAULT NULL::text, p_student uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_id uuid, order_seq integer, pickup_code text, table_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_day date := public.business_day_of(now());
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
  v_late_min int := (extract(hour from now() at time zone 'Asia/Baghdad') * 60
                     + extract(minute from now() at time zone 'Asia/Baghdad'))::int;
  v_line_note text;
  v_code text;
  v_table text;
  v_remote boolean := p_channel in ('delivery', 'pickup', 'curbside');
  v_try int := 0;
  v_student boolean := false;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty order';
  end if;

  select e.id into v_cashier from employees e
    where e.auth_user_id = auth.uid() and e.is_active limit 1;

  v_expediter := public.current_expediter();

  -- هل هذا طالبٌ مقبول؟ سؤالٌ واحد قبل الحلقة، وجوابه يحكم كل سطر بعده.
  -- والحالة تُقرأ من القاعدة لا من الطلب: الرابط قد يُنسَخ، والقبول لا يُنسَخ.
  if p_student is not null then
    select (s.status = 'active') into v_student from students s where s.id = p_student;
    v_student := coalesce(v_student, false);
  end if;

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

    -- صنفٌ طلابيّ في طلب غير طالب: يُرفض الطلب كلّه ولا يُسعَّر بالسعر العادي.
    -- التسعير الصامت كان يعني أن رابطاً مسرَّباً يبيع صنفاً لم يُعرَض لصاحبه
    if v_item.student_only and not v_student then
      raise exception 'students only: %', v_item.name_ar;
    end if;

    -- قسم يغلق 02:00 فجراً (برجر/زنجر…): الطلب من المنيو العام يُرفض حتى 09:00.
    -- الكاشير وتوترز/واتساب لا يُمنعون — الكاشير يعرف إن كان الطبّاخ موجوداً.
    if p_source = 'web' and v_late_min >= 150 and v_late_min < 540
       and exists (select 1 from categories c where c.id = v_item.category_id and c.late_cutoff) then
      raise exception 'late cutoff: %', v_item.name_ar;
    end if;

    if nullif(v_line->>'variant_id', '') is not null then
      select * into v_variant from item_variants
        where id = (v_line->>'variant_id')::uuid and item_id = v_item.id and is_active;
      if not found then raise exception 'variant not available'; end if;
    end if;

    /*
     * السعر — والترتيب هو كل شيء.
     *
     * سعرُ الطالب لهذا **الحجم** أولاً، فإن لم يُكتب فسعر الحجم العادي، ثم
     * سعر الطالب للصنف، ثم سعره العادي.
     *
     * وسعرُ الحجم العادي يسبق سعرَ الطالب للصنف عمداً: لو وُضع للصنف سعر
     * طالبٍ ٤٠٠٠ ولم يُكتب للوجبة شيء، فالوجبة تبقى بثمنها — لأنها أغلى
     * بألفين، وبيعُها بسعر الساندويچ خسارةٌ صامتة. لا خصم على حجمٍ لم
     * يُكتب له خصم.
     */
    v_price := case when v_student
                 then coalesce(v_variant.student_price, v_variant.price_override, v_item.student_price, v_item.price)
                 else coalesce(v_variant.price_override, v_item.price) end;
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
end $function$;

revoke all on function public.place_order(order_channel, jsonb, uuid, text, text, text, text, text, text, uuid) from public;
grant execute on function public.place_order(order_channel, jsonb, uuid, text, text, text, text, text, text, uuid) to anon, authenticated, service_role;

-- والتوقيع القديم (تسعة معاملات) يُسقَط: بقاؤه يعني نسختين من قاعدة التسعير،
-- وPostgREST قد تختار أيّهما شاءت
drop function if exists public.place_order(order_channel, jsonb, uuid, text, text, text, text, text, text);

notify pgrst, 'reload schema';
