-- ── المنيو بالإنكليزية ─────────────────────────────────────────────────────
--
-- الموقع التعريفي بخمس لغات، وأزراره كلّها تفتح منيو عربياً صرفاً: الزائر
-- الذي قرأ «Order now» يصل إلى شاشة لا يقرأ منها حرفاً. القرار: أيّ لغة غير
-- العربية تفتح المنيو بالإنكليزية — وهي ما يقرؤه الزائر الأجنبي فعلاً.
--
-- الأعمدة تقبل NULL: صنفٌ جديد يُضاف غداً بلا ترجمة يظهر باسمه العربي بدل أن
-- يظهر فارغاً. و`order_items.name_ar` **لا يُمسّ**: لقطة الاسم وقت البيع تبقى
-- عربية مهما اختار الزبون — تذكرة المطبخ والإيصال يقرأهما موظّفون عرب.

alter table public.categories    add column if not exists name_en text;
alter table public.menu_items    add column if not exists name_en text;
alter table public.menu_items    add column if not exists description_en text;
alter table public.item_variants add column if not exists name_en text;

-- ── الأقسام ────────────────────────────────────────────────────────────────
update public.categories set name_en = v.en from (values
  ('كنتاكي', 'Fried Chicken'),
  ('بيتزا', 'Pizza'),
  ('برجر', 'Burgers'),
  ('زنجر', 'Zinger'),
  ('فرايز', 'Fries & Sides'),
  ('صوصات', 'Sauces'),
  ('مشروبات', 'Drinks'),
  ('المشروبات الباردة', 'Cold Drinks'),
  ('المشروبات الساخنة', 'Hot Drinks'),
  ('المعجنات', 'Pastries'),
  ('آيس تي', 'Iced Tea'),
  ('الموهيتو', 'Mojito'),
  ('سموذي', 'Smoothies'),
  ('فرابيه', 'Frappé'),
  ('ميلك شيك', 'Milkshakes')
) as v(ar, en) where public.categories.name_ar = v.ar;

-- ── الأحجام ────────────────────────────────────────────────────────────────
-- «ساندويچ» بالچ الفارسية و«ساندويج» بالجيم — الاثنان في القاعدة
update public.item_variants set name_en = v.en from (values
  ('صغير', 'Small'), ('وسط', 'Medium'), ('كبير', 'Large'),
  ('وجبة', 'Meal'), ('ساندويج', 'Sandwich'), ('ساندويچ', 'Sandwich')
) as v(ar, en) where public.item_variants.name_ar = v.ar;

-- ── الأصناف ────────────────────────────────────────────────────────────────
update public.menu_items set name_en = v.en from (values
  -- كنتاكي
  ('ريزو', 'Rizo'),
  ('كنتاكي 3 قطع', 'Fried Chicken · 3 pcs'),
  ('كنتاكي 4 قطع', 'Fried Chicken · 4 pcs'),
  ('كنتاكي 5 قطع', 'Fried Chicken · 5 pcs'),
  ('كنتاكي 8 قطع', 'Fried Chicken · 8 pcs'),
  ('كنتاكي 15 قطعة', 'Fried Chicken · 15 pcs'),
  ('كنتاكي 4 فخذ', 'Chicken Thighs · 4 pcs'),
  ('كنتاكي 6 فخذ', 'Chicken Thighs · 6 pcs'),
  ('ستربس 3 قطع', 'Chicken Strips · 3 pcs'),
  ('أجنحة', 'Chicken Wings'),
  ('البونلس', 'Boneless Chicken'),
  ('سلطة دايت', 'Diet Salad'),
  -- بيتزا
  ('بيتزا سوبريم', 'Supreme Pizza'),
  ('بيتزا بروني', 'Peperoni Pizza'),
  ('بيتزا فري فيجي', 'Veggie Pizza'),
  ('بيتزا دجاج الباربيكيو', 'BBQ Chicken Pizza'),
  ('بيتزا غريلد تشكن', 'Grilled Chicken Pizza'),
  ('بيتزا تشكن رانش', 'Chicken Ranch Pizza'),
  ('بيتزا ليمو 1 متر', 'Limo Pizza · 1 metre'),
  ('بيتزا مارغريتا', 'Margherita Pizza'),
  -- برجر
  ('بركر لحم', 'Beef Burger'),
  ('بركر لحم - ساندويچ', 'Beef Burger · Sandwich'),
  ('بركر لحم بالجبن', 'Beef Cheeseburger'),
  ('بركر لحم بالجبن - ساندويچ', 'Beef Cheeseburger · Sandwich'),
  ('دبل برجكر لحم بالجبن', 'Double Beef Cheeseburger'),
  ('بركر دجاج', 'Chicken Burger'),
  ('بركر دجاج بالجبن', 'Chicken Cheeseburger'),
  ('بركر سموكي', 'Smoky Burger'),
  ('ماشروم بركر', 'Mushroom Burger'),
  ('فيلي جيز ستيك', 'Philly Cheesesteak'),
  ('بركر جيلي', 'Jelly Burger'),
  -- زنجر
  ('كلاسيك زنجر', 'Classic Zinger'),
  ('زنجر بالجبن', 'Cheese Zinger'),
  ('سموك زنجر', 'Smoked Zinger'),
  ('زنجر بوفالو', 'Buffalo Zinger'),
  ('مايتي زنجر', 'Mighty Zinger'),
  ('فلر', 'Fillet'),
  ('تويستر', 'Twister'),
  ('رول دجاج', 'Chicken Roll'),
  -- فرايز
  ('فنكر دبل', 'Double Fries'),
  ('فنكر صوص', 'Fries with Sauce'),
  ('فنكر بالجبن', 'Cheese Fries'),
  ('فنكر صوص ونص جبن', 'Fries · Sauce & Half Cheese'),
  ('فنكر كوب', 'Fries Cup'),
  ('الويدجز', 'Potato Wedges'),
  ('خبز ثوم مع الجبن', 'Cheesy Garlic Bread'),
  ('الكرلي', 'Curly Fries'),
  ('جكن فرايز', 'Chicken Fries'),
  ('شيتو جكن فرايز', 'Cheeto Chicken Fries'),
  ('بصل مقرمش', 'Crispy Onion Rings'),
  -- صوصات
  ('بوفالو', 'Buffalo Sauce'),
  ('باربيكيو', 'BBQ Sauce'),
  ('ثوم', 'Garlic Sauce'),
  ('كولسلو', 'Coleslaw'),
  ('عسل الخردل', 'Honey Mustard'),
  ('ستيشن', 'Station Sauce'),
  ('رانش', 'Ranch'),
  ('جبن', 'Cheese Sauce'),
  ('سويت جيلي', 'Sweet Chilli'),
  ('هلبينو', 'Jalapeño'),
  ('صمون', 'Bread'),
  -- مشروبات
  ('ببسي', 'Pepsi'),
  ('ببسي عائلي', 'Pepsi · Family'),
  ('ببسي فريش', 'Pepsi · Fresh'),
  ('ببسي دايت', 'Pepsi Diet'),
  ('ببسي زيرو', 'Pepsi Zero'),
  ('ببسي جوال', 'Pepsi Can'),
  ('سفن', '7UP'),
  ('سفن فريش', '7UP · Fresh'),
  ('سفن دايت', '7UP Diet'),
  ('ميرندا', 'Mirinda'),
  ('ميرندا فريش', 'Mirinda · Fresh'),
  ('ديو', 'Mountain Dew'),
  ('حمضيات', 'Citrus'),
  ('شاني', 'Shani'),
  ('تفاح', 'Apple'),
  ('ماء', 'Water'),
  ('كوب ثلج', 'Cup of Ice'),
  ('موهيتو', 'Mojito'),
  -- القهوة والمعجنات والباردة (أقسام غير مفعّلة اليوم، تُترجَم كي لا تظهر
  -- عربية فجأةً يوم تُفعَّل)
  ('أمريكانو', 'Americano'),
  ('آيس أمريكانو', 'Iced Americano'),
  ('لاتيه', 'Latte'),
  ('آيس لاتيه', 'Iced Latte'),
  ('لاتيه منكّه', 'Flavoured Latte'),
  ('آيس لاتيه منكّه', 'Iced Flavoured Latte'),
  ('سبانش لاتيه', 'Spanish Latte'),
  ('آيس سبانش لاتيه', 'Iced Spanish Latte'),
  ('موكا', 'Mocha'),
  ('آيس موكا', 'Iced Mocha'),
  ('كراميل ماكياتو', 'Caramel Macchiato'),
  ('آيس كراميل ماكياتو', 'Iced Caramel Macchiato'),
  ('دبل إسبريسو', 'Double Espresso'),
  ('قهوة تركية', 'Turkish Coffee'),
  ('قهوة بالشوكولاتة', 'Chocolate Coffee'),
  ('هوت شوكليت', 'Hot Chocolate'),
  ('شاي كرك', 'Karak Tea'),
  ('آيس تي ليمون', 'Lemon Iced Tea'),
  ('آيس تي توت', 'Berry Iced Tea'),
  ('فرابيه فانيلا', 'Vanilla Frappé'),
  ('فرابيه كراميل', 'Caramel Frappé'),
  ('سموذي فراولة', 'Strawberry Smoothie'),
  ('سموذي مانجو', 'Mango Smoothie'),
  ('سموذي أناناس', 'Pineapple Smoothie'),
  ('سموذي رمان', 'Pomegranate Smoothie'),
  ('ميلك شيك أوريو', 'Oreo Milkshake'),
  ('ميلك شيك لوتس', 'Lotus Milkshake'),
  ('ميلك شيك نوتيلا', 'Nutella Milkshake'),
  ('ميلك شيك كوكيز', 'Cookies Milkshake'),
  ('موهيتو كلاسيك', 'Classic Mojito'),
  ('موهيتو صودا', 'Soda Mojito'),
  ('موهيتو طاقة', 'Energy Mojito'),
  ('دونات', 'Donut'),
  ('كرواسون', 'Croissant'),
  ('كوكيز', 'Cookies')
) as v(ar, en) where public.menu_items.name_ar = v.ar;

-- ── المنح والعروض ──────────────────────────────────────────────────────────
-- المنح على الأعمدة صريحة في 0002، فالعمود الجديد لا يُقرأ حتى يُضاف إليها
grant select (name_en, description_en) on public.menu_items to authenticated;
grant select (name_en) on public.item_variants to authenticated;

drop view if exists public.menu_public;
create view public.menu_public as
  select mi.id, mi.category_id, mi.name_ar, mi.name_en, mi.description_ar, mi.description_en, mi.image_url,
         mi.price, mi.flavors, mi.sort,
         c.name_ar as category_name, c.name_en as category_name_en, c.image_url as category_image, c.sort as category_sort,
         c.late_cutoff as category_late_cutoff
  from public.menu_items mi
  join public.categories c on c.id = mi.category_id
  where mi.is_active and c.is_active;
grant select on public.menu_public to anon, authenticated;

drop view if exists public.variant_public;
create view public.variant_public as
  select v.id, v.item_id, v.kind, v.name_ar, v.name_en,
         coalesce(v.price_override, mi.price) as price, v.sort
  from public.item_variants v
  join public.menu_items mi on mi.id = v.item_id
  where v.is_active and mi.is_active;
grant select on public.variant_public to anon, authenticated;
