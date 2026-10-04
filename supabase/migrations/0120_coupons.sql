-- الكوبونات — خصمٌ لزبونٍ بعينه، برمزٍ يُقال بالهاتف.
--
-- ومعه إصلاحُ عطلٍ حيّ وجده الفحص: **عروض الأصناف لم تكن تُطبَّق**. سعر
-- العرض يُحسب في متصفّح الزبون (`cart-storage.ts:23`) و`place_order` يُسعّر
-- من المنيو — فمن رأى «٨,٠٠٠ بدل ١٢,٠٠٠» دُفع عنه ١٢,٠٠٠. وهو في صميم
-- «الخصومات» المطلوبة، فيُغلق هنا.
--
-- ⚠ ولا تُمسّ `mark_order_paid`: ثلاثة مسارات تناديها (الكاشير، ومزامنة
-- العمل بلا إنترنت، والطلبات المؤجّلة)، وتغيير بصمتها يوقفها جميعاً للحظة
-- يمرّ فيها بيعٌ حقيقي. والسؤال الذي أرادته الإدارة — «كم كلّفتنا
-- الكوبونات؟» — يجيبه `coupon_redemptions` أدناه بدقّةٍ أعلى: بأي كوبون،
-- ولأي زبون، وعلى أي طلب.

-- ── ١. عرض اليوم يُطبَّق فعلاً ──────────────────────────────────────────────
--
-- `place_order` هو الموضع الوحيد الذي يُسعّر، والتعريف منقولٌ حرفياً من
-- القاعدة (pg_get_functiondef) وفيه سطران جديدان لا غير.
--
-- والعرض على الصنف بلا خيار: يوضَع على «بيتزا مارغريتا» لا على «كبير»، فلو
-- طُبِّق على خيارٍ سعرُه أعلى لخُصم من حيث لم يُقصد.

create or replace function public.apply_day_offer(p_item uuid, p_price int)
returns int language sql stable security definer set search_path = public as $$
  select least(p_price, coalesce((select o.offer_price from active_item_offers o where o.item_id = p_item), p_price))
$$;

revoke all on function public.apply_day_offer(uuid, int) from public, anon, authenticated;
grant execute on function public.apply_day_offer(uuid, int) to service_role;

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

    -- عرض اليوم — كان يُعرض في المتصفّح ولا يُطبَّق هنا، فيُحاسَب الزبون
    -- بالسعر الكامل. ولا يُطبَّق على خيار: العرض يوضَع على الصنف لا على
    -- «كبير»، ولا على سعر الطالب فهو أقلّ أصلاً.
    if not v_student and v_variant.id is null then
      v_price := public.apply_day_offer(v_item.id, v_price);
    end if;
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

-- ── ٢. الكوبونات ───────────────────────────────────────────────────────────

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  -- ٦ أحرف بلا I و L و O و 0 و 1 — تُقال بالهاتف بلا لبس
  code text not null unique,
  kind text not null check (kind in ('amount', 'percent', 'item')),
  value int not null check (value >= 0),
  -- للصنف المجاني
  item_id uuid references public.menu_items(id) on delete set null,
  -- لزبونٍ بعينه: الرمز ستّة أحرف تُخمَّن، والهاتف هو حراسته الحقيقية
  customer_id uuid references public.customers(id) on delete set null,
  phone text,
  max_uses int not null default 1 check (max_uses >= 1),
  used_count int not null default 0 check (used_count >= 0),
  min_order int check (min_order is null or min_order > 0),
  expires_on date,
  note text,
  created_by uuid references public.employees(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
create index if not exists coupons_creator_idx on public.coupons(created_by, created_at desc);
create index if not exists coupons_phone_idx on public.coupons(phone);

-- سجلّ الاستبدال — وهو ما يجيب «كم كلّفتنا الكوبونات»
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  amount int not null check (amount >= 0),
  business_day date not null default public.business_day_of(now()),
  by_employee uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from anon, authenticated;
create index if not exists coupon_red_day_idx on public.coupon_redemptions(business_day);

-- ── ٣. توليد الرمز ─────────────────────────────────────────────────────────
--
-- نفس أبجدية `gen_pickup_code` (0043) للسبب نفسه: تُقرأ على الهاتف بلا أن
-- يُسمع حرفٌ مكان آخر. وستّة أحرف لأن رمز الاستلام ثلاثة ويُعاد كل يوم،
-- وهذا عالميٌّ ودائم.
create or replace function public.gen_coupon_code()
returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; v text; i int;
begin
  for i in 1..20 loop
    v := '';
    for i in 1..6 loop v := v || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    if not exists (select 1 from coupons where code = v) then return v; end if;
  end loop;
  -- بعد عشرين محاولة: الاحتمال مهمل، والفشل الصريح خيرٌ من رمزٍ مكرّر
  raise exception 'could not generate a free coupon code';
end $$;

-- ── ٤. الفحص والاستبدال ────────────────────────────────────────────────────
--
-- التوأم المتعمّد: `coupon_check` تقرأ ولا تغيّر (للعرض قبل الدفع)، و
-- `redeem_coupon` تقفل الصفّ ثم تَعدّ — على نمط `redeem_points` (0002).
-- والعدّ في القاعدة لا في المتصفّح: متصفّحٌ لا يُؤتمن على عدٍّ يُنقص مالاً.

create or replace function public.coupon_check(p_code text, p_subtotal int, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c coupons; v_disc int; v_phone text := public.norm_iq_phone(p_phone);
begin
  if coalesce(btrim(p_code), '') = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  select * into c from coupons where code = upper(btrim(p_code));
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  if not c.is_active then return jsonb_build_object('ok', false, 'reason', 'off'); end if;
  if c.expires_on is not null and c.expires_on < public.business_day_of(now())
     then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if c.used_count >= c.max_uses then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if c.min_order is not null and coalesce(p_subtotal, 0) < c.min_order
     then return jsonb_build_object('ok', false, 'reason', 'min', 'min_order', c.min_order); end if;
  -- كوبونٌ لزبونٍ بعينه لا يُستعمله غيره. والكاشير يمرّر هاتف الزبون.
  if c.phone is not null and v_phone is distinct from c.phone
     then return jsonb_build_object('ok', false, 'reason', 'phone'); end if;

  v_disc := case when c.kind = 'percent'
                 then round(greatest(0, coalesce(p_subtotal, 0)) * least(100, greatest(0, c.value)) / 100.0)
                 else c.value end;
  -- لا يتجاوز الخصم قيمة الطلب — نفس قاعدة mark_order_paid منذ 0059
  v_disc := least(greatest(0, coalesce(p_subtotal, 0)), greatest(0, v_disc));
  return jsonb_build_object('ok', true, 'discount', v_disc, 'kind', c.kind, 'value', c.value,
                            'item_id', c.item_id, 'expires_on', c.expires_on, 'min_order', c.min_order,
                            'left', c.max_uses - c.used_count);
end $$;

revoke all on function public.coupon_check(text, int, text) from public, anon, authenticated;
grant execute on function public.coupon_check(text, int, text) to anon, authenticated, service_role;

create or replace function public.redeem_coupon(p_code text, p_subtotal int, p_order uuid default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c coupons; v jsonb; v_disc int;
begin
  v := public.coupon_check(p_code, p_subtotal, p_phone);
  if not (v->>'ok')::boolean then return v; end if;

  -- القفل هنا: بين الفحص والعدّ قد يستبدله جهازٌ آخر
  select * into c from coupons where code = upper(btrim(p_code)) for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  if c.used_count >= c.max_uses then return jsonb_build_object('ok', false, 'reason', 'used'); end if;

  v_disc := (v->>'discount')::int;
  update coupons set used_count = used_count + 1 where id = c.id;
  insert into coupon_redemptions(coupon_id, order_id, amount, by_employee)
    values (c.id, p_order, v_disc, public.me_employee());
  return v;
end $$;

revoke all on function public.redeem_coupon(text, int, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_coupon(text, int, uuid, text) to service_role;

notify pgrst, 'reload schema';
