-- 0030_station_menu.sql — the real «ستيشن» menu, priced from the printed board.
--
-- Dual prices on the board mean: higher = وجبة (sandwich + فنكر + مشروب غازي),
-- lower = the item alone. Modelled with the existing priced-variant mechanism:
-- menu_items.price holds the alone price and a «وجبة» variant carries the
-- upgrade — so place_order keeps recomputing money server-side, no new path.
--
-- The cafe menu is DEACTIVATED, never deleted: order_items.item_id points at it
-- and the dashboard + Telegram bot read that sales history.
-- Idempotent — every insert is guarded by name.

-- ── 1. retire the cafe menu ───────────────────────────────────────────────
update public.categories set is_active = false
 where name_ar in ('المشروبات الساخنة','المشروبات الباردة','آيس تي','الموهيتو',
                   'فرابيه','ميلك شيك','سموذي','المعجنات');
update public.menu_items set is_active = false
 where category_id in (select id from public.categories where not is_active);

-- ── 2. categories, each wired to the station that cooks it ────────────────
-- صوصات has no station: it prints on the receipt and the assembly ticket, but
-- generates no kitchen ticket.
insert into public.categories(name_ar, sort, is_active, station_id)
select v.name_ar, v.sort, true, s.id
from (values
  ('بيتزا',  'pizza_oven', 1),
  ('برجر',   'burger',     2),
  ('كنتاكي', 'grill',      3),
  ('زنجر',   'grill',      4),
  ('فرايس',  'fryer',      5),
  ('صوصات',  null,         6)
) v(name_ar, station_key, sort)
left join public.stations s on s.name_en = v.station_key
where not exists (select 1 from public.categories c where c.name_ar = v.name_ar);

-- keep routing correct even if a category row already existed
update public.categories c set station_id = s.id
from (values ('بيتزا','pizza_oven'),('برجر','burger'),('كنتاكي','grill'),
             ('زنجر','grill'),('فرايس','fryer')) v(name_ar, station_key)
join public.stations s on s.name_en = v.station_key
where c.name_ar = v.name_ar and c.station_id is distinct from s.id;

-- ── 3. items (price = the ALONE price; وجبة comes from a variant) ─────────
insert into public.menu_items(category_id, name_ar, price, flavors, sort)
select c.id, v.name_ar, v.price, v.flavors, v.sort
from (values
  ('بيتزا','بيتزا دجاج الباربيكيو', 12000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 1),
  ('بيتزا','بيتزا فري فيجي',        12000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 2),
  ('بيتزا','بيتزا سوبريم',          12000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 3),
  ('بيتزا','بيتزا بروني',           12000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 4),
  ('بيتزا','بيتزا غريلد تشكن',      12000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 5),
  ('بيتزا','بيتزا تشكن رانش',       12000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 6),
  ('بيتزا','بيتزا ليمو 1 متر',      36000, '{"كلاسيك","عجينة سميكة","محشية الأطراف"}'::text[], 7),

  ('برجر','برجر كلاسيك',      4750, '{}'::text[], 1),
  ('برجر','برجر دجاج',        4250, '{}'::text[], 2),
  ('برجر','برجر بالجبن',      5250, '{}'::text[], 3),
  ('برجر','برجر سموكي',       5750, '{}'::text[], 4),
  ('برجر','ماشروم برجر',      6500, '{}'::text[], 5),
  ('برجر','فيلي جبز ستيك',    6000, '{}'::text[], 6),
  ('برجر','برجر جيلي',        6000, '{}'::text[], 7),
  ('برجر','دبل برجر بالجبن',  8750, '{}'::text[], 8),

  ('زنجر','كلاسيك زنجر',  4500, '{}'::text[], 1),
  ('زنجر','سموك زنجر',    5000, '{}'::text[], 2),
  ('زنجر','زنجر بوفالو',  5000, '{}'::text[], 3),
  ('زنجر','مايتي زنجر',   7000, '{}'::text[], 4),

  ('كنتاكي','كنتاكي 15 قطعة', 34000, '{}'::text[], 1),
  ('كنتاكي','كنتاكي 8 قطع',   19000, '{}'::text[], 2),
  ('كنتاكي','كنتاكي 5 قطع',   12500, '{}'::text[], 3),
  ('كنتاكي','كنتاكي 3 قطع',    7750, '{}'::text[], 4),
  ('كنتاكي','ستربس 3 قطع',     6000, '{}'::text[], 5),
  ('كنتاكي','أجنحة',           6000, '{"سويت جيلي","باربيكيو","عسل الخردل","بوفالو"}'::text[], 6),
  ('كنتاكي','البوبلنز',        3500, '{"سويت جيلي","باربيكيو","عسل الخردل","بوفالو"}'::text[], 7),
  ('كنتاكي','ريزو',            5000, '{}'::text[], 8),

  ('فرايس','الويدجز',           2500, '{}'::text[], 1),
  ('فرايس','الكرلي',            3000, '{}'::text[], 2),
  ('فرايس','بصل مقرمش',         3000, '{}'::text[], 3),
  ('فرايس','خبز ثوم مع الجبن',  3500, '{}'::text[], 4),
  ('فرايس','فنكر صوص',          4000, '{}'::text[], 5),
  ('فرايس','فنكر بالجبن',       4000, '{}'::text[], 6),
  ('فرايس','جكن فرايز',         5000, '{}'::text[], 7),
  ('فرايس','شيتو جكن فرايز',    6000, '{}'::text[], 8),

  ('صوصات','بوفالو',      0, '{}'::text[], 1),
  ('صوصات','باربيكيو',    0, '{}'::text[], 2),
  ('صوصات','ثوم',         0, '{}'::text[], 3),
  ('صوصات','عسل الخردل',  0, '{}'::text[], 4),
  ('صوصات','رانش',        0, '{}'::text[], 5),
  ('صوصات','جبن',         0, '{}'::text[], 6),
  ('صوصات','سويت جيلي',   0, '{}'::text[], 7)
) v(cat, name_ar, price, flavors, sort)
join public.categories c on c.name_ar = v.cat
where not exists (
  select 1 from public.menu_items m where m.category_id = c.id and m.name_ar = v.name_ar
);

-- ── 4. «وجبة» upgrades — the higher number on the board ───────────────────
-- The alone variant inherits menu_items.price (price_override null), the same
-- convention 0003_seed.sql used for «صغير».
insert into public.item_variants(item_id, kind, name_ar, price_override, sort)
select m.id, 'size'::public.variant_kind, x.label, x.price, x.sort
from (values
  ('برجر كلاسيك',     6750),
  ('برجر دجاج',       6250),
  ('برجر بالجبن',     7250),
  ('برجر سموكي',      7750),
  ('ماشروم برجر',     8500),
  ('فيلي جبز ستيك',   8000),
  ('برجر جيلي',       8000),
  ('دبل برجر بالجبن', 10750),
  ('كلاسيك زنجر',     6500),
  ('سموك زنجر',       7000),
  ('زنجر بوفالو',     7000),
  ('مايتي زنجر',      9000)
) v(item_name, meal_price)
join public.menu_items m on m.name_ar = v.item_name
cross join lateral (values
  ('ساندويچ', null::int,    1),
  ('وجبة',    v.meal_price, 2)
) x(label, price, sort)
where not exists (
  select 1 from public.item_variants iv where iv.item_id = m.id and iv.name_ar = x.label
);

insert into public.item_variants(item_id, kind, name_ar, price_override, sort)
select m.id, 'size'::public.variant_kind, x.label, x.price, x.sort
from (values
  ('بيتزا دجاج الباربيكيو', 17000),
  ('بيتزا فري فيجي',        17000),
  ('بيتزا سوبريم',          17000),
  ('بيتزا بروني',           17000),
  ('بيتزا غريلد تشكن',      17000),
  ('بيتزا تشكن رانش',       17000)
) v(item_name, meal_price)
join public.menu_items m on m.name_ar = v.item_name
cross join lateral (values
  ('منفرد', null::int,    1),
  ('وجبة',  v.meal_price, 2)
) x(label, price, sort)
where not exists (
  select 1 from public.item_variants iv where iv.item_id = m.id and iv.name_ar = x.label
);
