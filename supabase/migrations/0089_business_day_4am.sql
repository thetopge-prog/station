-- ═══ يوم العمل من 9 صباحاً إلى 3 فجراً ═══
--
-- كان اليوم يُقطع عند منتصف الليل بغداد، فتذهب طلبات 12–3 فجراً إلى «الغد»
-- ويطلع جرد اليوم ناقص آخر ثلاث ساعات من الوردية المسائية. المالك: اليوم من
-- 9 صباحاً إلى 3 فجراً، وتقرير البوت في 3:00.
--
-- الحدّ يصير 04:00 بغداد — بعد نهاية أطول وردية وقبل بداية أبكرها — وهو ما
-- يستعمله الحضور أصلاً (work_day_of، 0062). دالة واحدة business_day_of() تحلّ
-- محلّ التعبير المكتوب باليد في تسعة أعمدة وثماني دوال؛ ونصّ الدوال هو نصّها
-- الأخير حرفاً بحرف مع الاستبدال وحده — لا منطق يتغيّر هنا غير التاريخ.
-- ما سُجّل قبل الترحيل يبقى بيومه.

create or replace function public.business_day_of(p_at timestamptz default now())
returns date language sql stable set search_path = public as $fn$
  select ((p_at at time zone 'Asia/Baghdad') - interval '4 hours')::date;
$fn$;
grant execute on function public.business_day_of(timestamptz) to anon, authenticated, service_role;

alter table public.orders               alter column business_day set default public.business_day_of(now());
alter table public.cashier_sessions     alter column business_day set default public.business_day_of(now());
alter table public.debt_entries         alter column business_day set default public.business_day_of(now());
alter table public.expenses             alter column business_day set default public.business_day_of(now());
alter table public.item_offers          alter column business_day set default public.business_day_of(now());
alter table public.partner_settlements  alter column business_day set default public.business_day_of(now());
alter table public.purchase_orders      alter column business_day set default public.business_day_of(now());
alter table public.shifts               alter column business_day set default public.business_day_of(now());
alter table public.stock_movements      alter column business_day set default public.business_day_of(now());

-- تقرير البوت الليلي: كان 23:59 بغداد (20:59 UTC) — يصير 03:00 بغداد (00:00 UTC).
-- cron.job ملك مالك الامتداد؛ التعديل عبر الدالة الرسمية لا بتحديث الجدول.
select cron.alter_job(1, schedule := '0 0 * * *');

-- ── place_order (من 0072_line_notes_takeaway.sql) — 1 موضع ──
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

-- ── mark_order_paid (من 0079_paid_reseq.sql) — 1 موضع ──
create or replace function public.mark_order_paid(
  p_order uuid, p_discount integer default 0, p_customer uuid default null,
  p_award_points integer default 0, p_extra integer default 0, p_extra_note text default null)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_seq int; v_cust uuid; v_sub int; v_disc int;
  v_day date := public.business_day_of(now());
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

-- ── open_cashier_session (من 0063_one_drawer_shopwide.sql) — 1 موضع ──
create or replace function public.open_cashier_session(
  p_float int,
  p_from_session uuid default null,
  p_counted int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_id uuid;
  v_day date := public.business_day_of(now());
  v_holder uuid;
  v_holder_name text;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  if v_emp is null then raise exception 'no employee record'; end if;

  -- ورديات الأيام الماضية: تُغلق بما هو معروف عنها، بلا اختراع أرقام.
  -- expected_cash يبقى كما هو (قد يكون فارغاً) لأن أحداً لم يعدّ الصندوق،
  -- وتزييف عدّ لم يحدث أسوأ من الاعتراف بأنه لم يحدث.
  --
  -- ولأي كاشير كان، لا لي وحدي: الصندوق واحد، فوردية أمس المنسيّة تسدّه على
  -- كل من يأتي بعدها. كانت هذه أخطر نصف سطر في الملف.
  update cashier_sessions
     set closed_at = now(),
         close_note = coalesce(nullif(close_note, ''), '') ||
                      case when coalesce(close_note, '') = '' then '' else ' · ' end ||
                      'أُغلقت تلقائياً — بقيت مفتوحة من يوم ' || business_day::text
   where closed_at is null
     and business_day < v_day;

  -- الحارس على مستوى المحل، لأن الفهرس كذلك. والرسالة تقول من يحمل الصندوق:
  -- «مفتوحة» وحدها تُرسل الكاشير يبحث في شاشته، والاسم يُرسله إلى زميله.
  select s.cashier_id, e.name_ar into v_holder, v_holder_name
    from cashier_sessions s
    join employees e on e.id = s.cashier_id
   where s.closed_at is null
   limit 1;

  if v_holder = v_emp then
    raise exception 'session already open';
  elsif v_holder is not null then
    raise exception 'drawer held by %', v_holder_name;
  end if;

  -- confirming receipt closes out the predecessor's audit trail
  if p_from_session is not null then
    update cashier_sessions
       set handover_confirmed_at = now(),
           handover_counted = coalesce(p_counted, p_float)
     where id = p_from_session and handover_confirmed_at is null;
  end if;

  insert into cashier_sessions(cashier_id, opening_float, opened_from)
    values (v_emp, greatest(0, coalesce(p_float, 0)), p_from_session)
    returning id into v_id;
  return v_id;
end $$;

-- ── open_shift (من 0031_shifts_sources.sql) — 1 موضع ──
create or replace function public.open_shift(
  p_role text,
  p_employee uuid,
  p_station uuid default null,
  p_exclusive boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.business_day_of(now());
  v_actor uuid;
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_actor from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  -- exclusive roles (expediter, cashier) have exactly one holder per station so
  -- the printed name is never ambiguous; chefs/cleaners may overlap freely
  if p_exclusive then
    update shifts set closed_at = now()
     where closed_at is null and business_day = v_day and role = p_role
       and station_id is not distinct from p_station;
  else
    update shifts set closed_at = now()
     where closed_at is null and business_day = v_day and role = p_role
       and employee_id = p_employee;
  end if;

  insert into shifts(business_day, role, employee_id, station_id, opened_by)
    values (v_day, p_role, p_employee, p_station, v_actor)
    returning id into v_id;
  return v_id;
end $$;

-- ── current_expediter (من 0032_order_lifecycle.sql) — 1 موضع ──
create or replace function public.current_expediter(p_station uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select s.employee_id
  from public.shifts s
  where s.closed_at is null
    and s.role = 'expediter'
    and s.business_day = public.business_day_of(now())
    and (p_station is null or s.station_id is not distinct from p_station)
  order by s.opened_at desc
  limit 1;
$$;

-- ── busy_tables (من 0035_fulfilment.sql) — 1 موضع ──
create or replace function public.busy_tables()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct o.table_no
  from public.orders o
  where o.table_no is not null
    and o.business_day = public.business_day_of(now())
    and (
      o.status = 'pending'
      or (o.status = 'paid' and o.paid_at is not null and o.paid_at > now() - interval '30 minutes')
    );
$$;

-- ── bep_today (من 0060_profit_admin_only.sql) — 1 موضع ──
create or replace function public.bep_today()
returns table(fixed_cost integer, revenue integer, cogs integer, gross_profit integer,
              remaining integer, met boolean, configured boolean, orders_count integer)
language plpgsql stable security definer set search_path = public as $fn$
declare v_fixed record;
begin
  select * into v_fixed from public.daily_fixed_cost();

  select
    coalesce(sum(o.subtotal - o.discount + o.extra), 0)::int,
    coalesce(sum(o.cost_total), 0)::int,
    count(*)::int
  into revenue, cogs, orders_count
  from orders o
  where o.business_day = public.business_day_of(now())
    and o.status = 'paid';

  fixed_cost := v_fixed.total;
  configured := v_fixed.configured;
  gross_profit := revenue - cogs;
  remaining := greatest(0, v_fixed.total - (revenue - cogs));
  met := v_fixed.configured and (revenue - cogs) >= v_fixed.total;
  return next;
end $fn$;

-- ── receive_stock (من 0065_backdated_entries.sql) — 2 موضع ──
create or replace function public.receive_stock(
  p_ingredient uuid,
  p_qty numeric,
  p_unit_cost int default 0,
  p_expiry date default null,
  p_supplier text default null,
  p_note text default null,
  p_received_on date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_batch uuid;
  v_shelf int;
  v_day date := coalesce(p_received_on, public.business_day_of(now()));
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'quantity must be positive'; end if;
  if v_day > public.business_day_of(now()) then raise exception 'received_on in the future'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  -- مدة الصلاحية تُحسب من يوم الاستلام الفعلي، لا من اليوم
  if p_expiry is null then
    select default_shelf_days into v_shelf from ingredients where id = p_ingredient;
    if v_shelf is not null then p_expiry := v_day + v_shelf; end if;
  end if;

  insert into inventory_batches(ingredient_id, qty_received, qty_remaining, unit_cost, expiry_date, supplier, note, created_by, received_on)
    values (p_ingredient, p_qty, p_qty, greatest(0, coalesce(p_unit_cost, 0)), p_expiry,
            nullif(trim(coalesce(p_supplier, '')), ''), nullif(trim(coalesce(p_note, '')), ''), v_emp, v_day)
    returning id into v_batch;

  insert into stock_movements(ingredient_id, batch_id, delta, reason, note, created_by, business_day)
    values (p_ingredient, v_batch, p_qty, 'receive', nullif(trim(coalesce(p_supplier, '')), ''), v_emp, v_day);

  return v_batch;
end $$;

notify pgrst, 'reload schema';
