-- 0037_inventory.sql — raw materials, batches, expiry, and shortage POs.
--
-- Three tables and one rule:
--   ingredients        what the kitchen buys
--   inventory_batches  each delivery, with its own cost and expiry
--   stock_movements    every gram that moved, and why
--
-- Stock on hand is DERIVED from batches, never stored as a single number. A
-- stored total drifts the first time someone edits history, and it cannot
-- answer the only question that matters for food: which of these is about to
-- go off.
--
-- Consumption is FEFO, not FIFO — first EXPIRY out. A delivery that arrived
-- later but expires tomorrow must be used before an older one that keeps for a
-- month. Literal FIFO would quietly bin the fresher stock.
--
-- Recipes are wired but empty. The owner chose per-item costs for now; the
-- moment recipe_lines has rows, sales can deduct stock automatically and COGS
-- computes itself, with no code change.

-- ── 1. what the kitchen buys ──────────────────────────────────────────────
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  /** the unit the kitchen actually counts in — buying in boxes and cooking in
      grams is the classic way these systems start lying */
  unit text not null default 'كغم' check (unit in ('كغم', 'غم', 'لتر', 'مل', 'حبة', 'علبة', 'كيس', 'صندوق')),
  category text,
  /** reorder point: at or below this, the item lands on a shortage PO */
  min_qty numeric(12, 3) not null default 0 check (min_qty >= 0),
  /** typical shelf life, used to pre-fill the expiry date on receipt */
  default_shelf_days int,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ingredients enable row level security;
revoke all on public.ingredients from anon, authenticated;
grant select on public.ingredients to authenticated;
create policy ingredients_staff_read on public.ingredients
  for select to authenticated using (public.is_staff());

-- ── 2. one row per delivery ───────────────────────────────────────────────
create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  qty_received numeric(12, 3) not null check (qty_received > 0),
  /** what is left of THIS batch; FEFO draws it down */
  qty_remaining numeric(12, 3) not null check (qty_remaining >= 0),
  /** cost per unit for this delivery — prices move, so it lives on the batch */
  unit_cost int not null default 0 check (unit_cost >= 0),
  received_on date not null default (now() at time zone 'Asia/Baghdad')::date,
  expiry_date date,
  supplier text,
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_batches_fefo_idx
  on public.inventory_batches(ingredient_id, expiry_date nulls last, received_on)
  where qty_remaining > 0;
alter table public.inventory_batches enable row level security;
revoke all on public.inventory_batches from anon, authenticated;
grant select on public.inventory_batches to authenticated;
create policy inventory_batches_staff_read on public.inventory_batches
  for select to authenticated using (public.is_staff());

-- ── 3. the audit trail ────────────────────────────────────────────────────
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  batch_id uuid references public.inventory_batches(id) on delete set null,
  /** positive = in, negative = out */
  delta numeric(12, 3) not null,
  reason text not null check (reason in ('receive', 'consume', 'waste', 'expired', 'adjust')),
  note text,
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_day_idx on public.stock_movements(business_day);
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;

-- ── 4. recipes — wired, deliberately empty ────────────────────────────────
create table if not exists public.recipe_lines (
  item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  /** how much of the ingredient one sold unit consumes */
  qty numeric(12, 4) not null check (qty > 0),
  primary key (item_id, ingredient_id)
);
alter table public.recipe_lines enable row level security;
revoke all on public.recipe_lines from anon, authenticated;
grant select on public.recipe_lines to authenticated;
create policy recipe_lines_staff_read on public.recipe_lines
  for select to authenticated using (public.is_staff());

-- ── 5. live stock, derived ────────────────────────────────────────────────
create or replace view public.stock_status as
  select
    i.id,
    i.name_ar,
    i.unit,
    i.category,
    i.min_qty,
    coalesce(sum(b.qty_remaining), 0)::numeric(12, 3) as on_hand,
    -- weighted average of what is actually left, not of what was ever bought
    case when coalesce(sum(b.qty_remaining), 0) > 0
      then (sum(b.qty_remaining * b.unit_cost) / sum(b.qty_remaining))::int
      else 0 end as avg_unit_cost,
    min(b.expiry_date) filter (where b.qty_remaining > 0) as nearest_expiry,
    case
      when coalesce(sum(b.qty_remaining), 0) <= 0 then 'out'
      when coalesce(sum(b.qty_remaining), 0) <= i.min_qty then 'low'
      else 'ok'
    end as stock_state
  from public.ingredients i
  left join public.inventory_batches b
    on b.ingredient_id = i.id and b.qty_remaining > 0
  where i.is_active
  group by i.id, i.name_ar, i.unit, i.category, i.min_qty, i.sort
  order by i.sort, i.name_ar;
grant select on public.stock_status to authenticated;

-- ── 6. receiving ──────────────────────────────────────────────────────────
create or replace function public.receive_stock(
  p_ingredient uuid,
  p_qty numeric,
  p_unit_cost int default 0,
  p_expiry date default null,
  p_supplier text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_batch uuid;
  v_shelf int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'quantity must be positive'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  -- pre-fill the expiry from the ingredient's usual shelf life when the person
  -- receiving did not enter one; a null expiry silently opts out of the alerts
  -- that are the whole point of tracking batches
  if p_expiry is null then
    select default_shelf_days into v_shelf from ingredients where id = p_ingredient;
    if v_shelf is not null then
      p_expiry := ((now() at time zone 'Asia/Baghdad')::date + v_shelf);
    end if;
  end if;

  insert into inventory_batches(ingredient_id, qty_received, qty_remaining, unit_cost, expiry_date, supplier, note, created_by)
    values (p_ingredient, p_qty, p_qty, greatest(0, coalesce(p_unit_cost, 0)), p_expiry,
            nullif(trim(coalesce(p_supplier, '')), ''), nullif(trim(coalesce(p_note, '')), ''), v_emp)
    returning id into v_batch;

  insert into stock_movements(ingredient_id, batch_id, delta, reason, note, created_by)
    values (p_ingredient, v_batch, p_qty, 'receive', nullif(trim(coalesce(p_supplier, '')), ''), v_emp);

  return v_batch;
end $$;

-- ── 7. consuming, FEFO ────────────────────────────────────────────────────
/**
 * Draw `p_qty` down across batches, nearest expiry first.
 *
 * Returns what it could NOT satisfy. A kitchen that has already cooked the food
 * cannot be told "no" — so this never refuses; it records the shortfall so the
 * count is honest and the shortage shows up on the next PO.
 */
create or replace function public.consume_stock(
  p_ingredient uuid,
  p_qty numeric,
  p_reason text default 'consume',
  p_note text default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_left numeric := p_qty;
  v_take numeric;
  r record;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  if p_qty is null or p_qty <= 0 then return 0; end if;
  if p_reason not in ('consume', 'waste', 'expired', 'adjust') then p_reason := 'consume'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  for r in
    select id, qty_remaining from inventory_batches
     where ingredient_id = p_ingredient and qty_remaining > 0
     order by expiry_date nulls last, received_on, created_at
     for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.qty_remaining);
    update inventory_batches set qty_remaining = qty_remaining - v_take where id = r.id;
    insert into stock_movements(ingredient_id, batch_id, delta, reason, note, created_by)
      values (p_ingredient, r.id, -v_take, p_reason, p_note, v_emp);
    v_left := v_left - v_take;
  end loop;

  -- nothing left to draw from: record the negative so the books show the truth
  if v_left > 0 then
    insert into stock_movements(ingredient_id, batch_id, delta, reason, note, created_by)
      values (p_ingredient, null, -v_left, p_reason, coalesce(p_note, '') || ' (بلا رصيد)', v_emp);
  end if;

  return v_left;
end $$;

-- ── 8. shortage purchase order — فاتورة النواقص ──────────────────────────
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_day date not null default (now() at time zone 'Asia/Baghdad')::date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'received', 'cancelled')),
  note text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  /** what was on hand when the shortage was detected — context for the buyer */
  on_hand numeric(12, 3) not null default 0,
  min_qty numeric(12, 3) not null default 0,
  qty numeric(12, 3) not null check (qty > 0),
  est_unit_cost int not null default 0
);
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
revoke all on public.purchase_orders from anon, authenticated;
revoke all on public.purchase_order_lines from anon, authenticated;

/**
 * Build a shortage PO from everything at or below its reorder point.
 *
 * Orders up to TWICE the reorder point, so the buyer is not back here tomorrow
 * having bought exactly enough to be short again. Returns null when nothing is
 * short — the caller shows «لا توجد نواقص» rather than an empty invoice.
 */
create or replace function public.generate_shortage_po(p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid;
  v_po uuid;
  v_n int;
begin
  if not public.is_staff() then raise exception 'not staff'; end if;
  select e.id into v_emp from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;

  select count(*) into v_n from stock_status where stock_state in ('low', 'out');
  if v_n = 0 then return null; end if;

  insert into purchase_orders(note, created_by)
    values (nullif(trim(coalesce(p_note, '')), ''), v_emp)
    returning id into v_po;

  insert into purchase_order_lines(po_id, ingredient_id, on_hand, min_qty, qty, est_unit_cost)
    select v_po, s.id, s.on_hand, s.min_qty,
           greatest(s.min_qty * 2 - s.on_hand, s.min_qty, 1),
           s.avg_unit_cost
      from stock_status s
     where s.stock_state in ('low', 'out');

  return v_po;
end $$;

revoke execute on function public.receive_stock(uuid, numeric, int, date, text, text) from anon;
revoke execute on function public.consume_stock(uuid, numeric, text, text) from anon;
revoke execute on function public.generate_shortage_po(text) from anon;
