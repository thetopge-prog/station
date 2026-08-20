-- 0038_ingredients_seed.sql — a starter raw-materials list for Station.
--
-- Derived from the actual menu (pizza / burger / kentucky / zinger / fries /
-- sauces) so the inventory screen is usable the day it ships instead of being
-- an empty table nobody fills in. Quantities and shelf lives are STARTING
-- POINTS — the owner tunes min_qty against real consumption after a week, which
-- is the only way a reorder point is ever right.
--
-- Idempotent: guarded on name, so re-running never duplicates or overwrites a
-- threshold somebody has already tuned.

insert into public.ingredients(name_ar, unit, category, min_qty, default_shelf_days, sort)
select v.name_ar, v.unit, v.category, v.min_qty, v.shelf, v.sort
from (values
  -- بروتين — the expensive, fast-spoiling half of the kitchen
  ('صدور دجاج',        'كغم', 'بروتين',  10, 3,  1),
  ('قطع دجاج (كنتاكي)', 'كغم', 'بروتين',  15, 3,  2),
  ('شرائح لحم برجر',    'كغم', 'بروتين',  10, 3,  3),
  ('ستيك شرائح',        'كغم', 'بروتين',   5, 3,  4),
  ('مرتديلا',           'كغم', 'بروتين',   3, 14, 5),
  ('بيبروني',           'كغم', 'بروتين',   3, 21, 6),

  -- مخبوزات
  ('صمون برجر',   'حبة', 'مخبوزات', 60, 3, 10),
  ('صمون زنجر',   'حبة', 'مخبوزات', 40, 3, 11),
  ('خبز فيلي',    'حبة', 'مخبوزات', 20, 3, 12),
  ('عجينة بيتزا', 'كغم', 'مخبوزات', 10, 4, 13),

  -- ألبان
  ('جبن موزاريلا', 'كغم', 'ألبان', 10, 14, 20),
  ('جبن شرائح',    'كغم', 'ألبان',  4, 21, 21),
  ('جبن سائل',     'لتر', 'ألبان',  4, 30, 22),

  -- خضار — the shortest shelf life in the building
  ('طماطم',   'كغم', 'خضار', 8, 5, 30),
  ('خس',      'كغم', 'خضار', 5, 4, 31),
  ('بصل',     'كغم', 'خضار', 8, 20, 32),
  ('مخلل',    'كغم', 'خضار', 4, 60, 33),
  ('مشروم',   'كغم', 'خضار', 3, 5, 34),
  ('فلفل',    'كغم', 'خضار', 3, 7, 35),
  ('زيتون',   'كغم', 'خضار', 2, 90, 36),

  -- مجمّدات ومقالي
  ('بطاطا فرايز',   'كغم', 'مجمّدات', 20, 180, 40),
  ('بطاطا ودجز',    'كغم', 'مجمّدات', 10, 180, 41),
  ('بطاطا كرلي',    'كغم', 'مجمّدات', 10, 180, 42),
  ('حلقات بصل',     'كغم', 'مجمّدات',  6, 180, 43),
  ('ناغتس',         'كغم', 'مجمّدات',  6, 180, 44),
  ('زيت قلي',       'لتر', 'مجمّدات', 20, 365, 45),

  -- صوصات وبهارات
  ('صوص باربيكيو',   'لتر', 'صوصات', 4, 180, 50),
  ('صوص بوفالو',     'لتر', 'صوصات', 3, 180, 51),
  ('صوص رانش',       'لتر', 'صوصات', 3, 120, 52),
  ('صوص ثوم',        'لتر', 'صوصات', 3, 60,  53),
  ('صوص عسل الخردل', 'لتر', 'صوصات', 2, 180, 54),
  ('صوص سويت جيلي',  'لتر', 'صوصات', 2, 180, 55),
  ('كاتشب',          'لتر', 'صوصات', 4, 365, 56),
  ('مايونيز',        'لتر', 'صوصات', 4, 90,  57),
  ('خلطة تتبيل',     'كغم', 'صوصات', 5, 365, 58),
  ('طحين تغليف',     'كغم', 'صوصات', 10, 180, 59),

  -- تغليف ومشروبات — invisible until you run out mid-rush
  ('علب برجر',   'حبة', 'تغليف',   200, null, 70),
  ('علب بيتزا',  'حبة', 'تغليف',   100, null, 71),
  ('علب بطاطا',  'حبة', 'تغليف',   200, null, 72),
  ('أكياس',      'حبة', 'تغليف',   300, null, 73),
  ('مشروب غازي', 'حبة', 'مشروبات', 120, 180,  80)
) as v(name_ar, unit, category, min_qty, shelf, sort)
where not exists (select 1 from public.ingredients i where i.name_ar = v.name_ar);
