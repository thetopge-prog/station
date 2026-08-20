-- 0003_seed.sql — roles + the real Station menu (from the owner's Google Sheet).
-- Prices are IQD sell prices; cost defaults to 0 (owner enters costs in the admin
-- later — see plan open item #1). Idempotent + NON-destructive: the menu is seeded
-- only when empty, so admin edits are never clobbered on re-run.

do $$
declare
  c_hot uuid; c_cold uuid; c_tea uuid; c_moj uuid; c_frap uuid; c_shake uuid; c_smo uuid; c_pas uuid;
begin
  -- roles (idempotent by english name)
  insert into public.roles(name_ar, name_en)
    select 'مدير', 'admin' where not exists (select 1 from public.roles where name_en = 'admin');
  insert into public.roles(name_ar, name_en)
    select 'كاشير', 'cashier' where not exists (select 1 from public.roles where name_en = 'cashier');

  -- seed the menu only once
  if exists (select 1 from public.menu_items) then return; end if;

  insert into public.categories(name_ar, sort) values
    ('المشروبات الساخنة', 1),
    ('المشروبات الباردة', 2),
    ('آيس تي', 3),
    ('الموهيتو', 4),
    ('فرابيه', 5),
    ('ميلك شيك', 6),
    ('سموذي', 7),
    ('المعجنات', 8);

  select id into c_hot from public.categories where name_ar = 'المشروبات الساخنة';
  select id into c_cold from public.categories where name_ar = 'المشروبات الباردة';
  select id into c_tea from public.categories where name_ar = 'آيس تي';
  select id into c_moj from public.categories where name_ar = 'الموهيتو';
  select id into c_frap from public.categories where name_ar = 'فرابيه';
  select id into c_shake from public.categories where name_ar = 'ميلك شيك';
  select id into c_smo from public.categories where name_ar = 'سموذي';
  select id into c_pas from public.categories where name_ar = 'المعجنات';

  insert into public.menu_items(category_id, name_ar, price, flavors, sort) values
    -- المشروبات الساخنة
    (c_hot, 'إسبريسو', 2500, '{}', 1),
    (c_hot, 'دبل إسبريسو', 3000, '{}', 2),
    (c_hot, 'أمريكانو', 3000, '{}', 3),
    (c_hot, 'لاتيه', 3000, '{}', 4),
    (c_hot, 'لاتيه منكّه', 3500, '{كراميل,فانيلا,بندق}', 5),
    (c_hot, 'سبانش لاتيه', 3500, '{}', 6),
    (c_hot, 'كراميل ماكياتو', 4000, '{}', 7),
    (c_hot, 'موكا', 4000, '{دارك,وايت}', 8),
    (c_hot, 'قهوة تركية', 2500, '{}', 9),
    (c_hot, 'قهوة بالشوكولاتة', 2500, '{}', 10),   -- size variants below
    (c_hot, 'هوت شوكليت', 3000, '{}', 11),
    (c_hot, 'شاي كرك', 1500, '{}', 12),            -- size variants below
    -- المشروبات الباردة
    (c_cold, 'آيس أمريكانو', 3000, '{}', 1),
    (c_cold, 'آيس لاتيه', 3000, '{}', 2),
    (c_cold, 'آيس لاتيه منكّه', 3500, '{كراميل,فانيلا,بندق,هازلنت}', 3),
    (c_cold, 'آيس سبانش لاتيه', 3500, '{}', 4),
    (c_cold, 'آيس كراميل ماكياتو', 4000, '{}', 5),
    (c_cold, 'آيس موكا', 4000, '{دارك,وايت}', 6),
    -- آيس تي
    (c_tea, 'آيس تي ليمون', 3000, '{}', 1),
    (c_tea, 'آيس تي توت', 3000, '{}', 2),
    -- الموهيتو
    (c_moj, 'موهيتو كلاسيك', 3000, '{}', 1),
    (c_moj, 'موهيتو صودا', 4000, '{}', 2),
    (c_moj, 'موهيتو طاقة', 6000, '{}', 3),
    -- فرابيه
    (c_frap, 'فرابيه كراميل', 4500, '{}', 1),
    (c_frap, 'فرابيه فانيلا', 4500, '{}', 2),
    -- ميلك شيك
    (c_shake, 'ميلك شيك كوكيز', 5000, '{}', 1),
    (c_shake, 'ميلك شيك أوريو', 5000, '{}', 2),
    (c_shake, 'ميلك شيك نوتيلا', 5000, '{}', 3),
    (c_shake, 'ميلك شيك لوتس', 5000, '{}', 4),
    -- سموذي (size variants below)
    (c_smo, 'سموذي فراولة', 3000, '{}', 1),
    (c_smo, 'سموذي أناناس', 3000, '{}', 2),
    (c_smo, 'سموذي مانجو', 3000, '{}', 3),
    (c_smo, 'سموذي رمان', 3000, '{}', 4),
    -- المعجنات
    (c_pas, 'كرواسون', 2500, '{}', 1),
    (c_pas, 'دونات', 2500, '{}', 2),
    (c_pas, 'كوكيز', 2500, '{}', 3);

  -- size variants (صغير inherits item.price; وسط overrides)
  insert into public.item_variants(item_id, kind, name_ar, price_override, sort)
    select id, 'size'::public.variant_kind,'صغير', null, 1 from public.menu_items where name_ar = 'قهوة بالشوكولاتة'
    union all select id, 'size'::public.variant_kind,'وسط', 3500, 2 from public.menu_items where name_ar = 'قهوة بالشوكولاتة'
    union all select id, 'size'::public.variant_kind,'صغير', null, 1 from public.menu_items where name_ar = 'شاي كرك'
    union all select id, 'size'::public.variant_kind,'وسط', 3000, 2 from public.menu_items where name_ar = 'شاي كرك'
    union all select id, 'size'::public.variant_kind,'صغير', null, 1 from public.menu_items where name_ar = 'سموذي فراولة'
    union all select id, 'size'::public.variant_kind,'وسط', 5000, 2 from public.menu_items where name_ar = 'سموذي فراولة'
    union all select id, 'size'::public.variant_kind,'صغير', null, 1 from public.menu_items where name_ar = 'سموذي أناناس'
    union all select id, 'size'::public.variant_kind,'وسط', 5000, 2 from public.menu_items where name_ar = 'سموذي أناناس'
    union all select id, 'size'::public.variant_kind,'صغير', null, 1 from public.menu_items where name_ar = 'سموذي مانجو'
    union all select id, 'size'::public.variant_kind,'وسط', 5000, 2 from public.menu_items where name_ar = 'سموذي مانجو'
    union all select id, 'size'::public.variant_kind,'صغير', null, 1 from public.menu_items where name_ar = 'سموذي رمان'
    union all select id, 'size'::public.variant_kind,'وسط', 5000, 2 from public.menu_items where name_ar = 'سموذي رمان';
end $$;
