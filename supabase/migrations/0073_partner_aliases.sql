-- ═══ أسماء الأصناف عند شركات التوصيل ═══
--
-- توترز تسمّي «كلاسيك زنجر · وجبة» عندنا «سندويش زنجر» وتبيعه بسعرها. حين
-- تُقرأ شاشة طلبها، كل اسم يُترجم إلى صنفنا (وحجمه ونكهته) عبر هذا الجدول،
-- فيصل المطبخ بأسمائنا ويُحسب الجرد بأسعارنا. اسم لا مقابل له لا يُخترع:
-- يصل تنبيهاً وتربطه الإدارة مرّة واحدة من /partners.

-- طيّ عربي بسيط للمطابقة — نفس القواعد في foldArabic (external-order.ts)
create or replace function public.fold_ar(s text) returns text
language sql immutable as $$
  select lower(trim(regexp_replace(
    regexp_replace(
      translate(coalesce(s, ''), '٠١٢٣٤٥٦٧٨٩أإآٱةىئؤ', '0123456789ااااهييو'),
      '[ًٌٍَُِّْٰـ]', '', 'g'),
    '\s+', ' ', 'g')))
$$;

create table if not exists public.partner_item_aliases (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('toters', 'talabaty', 'zad')),
  -- كما يظهر عند الشركة، مع الخيار بعد «/» إن كان يغيّر الصنف: «وجبة كنتاكي / 3 قطع»
  alias text not null,
  alias_key text not null,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  variant_id uuid references public.item_variants(id) on delete set null,
  flavor text,
  created_at timestamptz not null default now(),
  unique (source, alias_key)
);
alter table public.partner_item_aliases enable row level security;
revoke all on public.partner_item_aliases from anon, authenticated;

-- رقم الشركة ومبلغها على الطلب — للمطابقة مع كشفهم، لا للجرد
alter table public.orders add column if not exists partner_ref text;
alter table public.orders add column if not exists partner_total int;
-- ما لم يُعرف من أسماء الشاشة، ليُربط
alter table public.external_order_alerts add column if not exists unknown_items text[];

-- ── بذرة توترز من قائمتهم كما صُوّرت ─────────────────────────────────────
-- كل سطر يُدرج فقط إن وُجد صنفه عندنا؛ الحجم إن وُجد وإلا الأساس.
do $$
declare
  r record;
  v_item uuid;
  v_var uuid;
begin
  for r in
    select * from (values
      ('برغر لحم كلاسيك',                 'بركر لحم',              'وجبة', null),
      ('برغر لحم بالجبنة',                'بركر لحم بالجبن',       'وجبة', null),
      ('برغر لحم مدخن',                   'بركر سموكي',            'وجبة', null),
      ('برغر لحم بالفطر',                 'ماشروم بركر',           'وجبة', null),
      ('برغر لحم تشيلي',                  'بركر جيلي',             'وجبة', null),
      ('برغر دجاج',                       'بركر دجاج',             'وجبة', null),
      ('برغر لحم دبل بالجبنة',            'دبل برجكر لحم بالجبن',  'وجبة', null),
      ('سندوبش فيليه ستيك لحم بالجبنة',   'فيلي جيز ستيك',         'وجبة', null),
      ('سندويش فيليه ستيك لحم بالجبنة',   'فيلي جيز ستيك',         'وجبة', null),
      ('سندويش زنجر',                     'كلاسيك زنجر',           'وجبة', null),
      ('سندويش زنجر بافلو',               'زنجر بوفالو',           'وجبة', null),
      ('سندويش زنجر مدخن',                'سموك زنجر',             'وجبة', null),
      ('سندويش زنجر دبل مايتي',           'مايتي زنجر',            'وجبة', null),
      ('صاج دجاج رول',                    'رول دجاج',              'وجبة', null),
      ('بيتزا سوبريم',                    'بيتزا سوبريم',          'وسط',  'سميك'),
      ('بيتزا فيري فيجي',                 'بيتزا فري فيجي',        'وسط',  'سميك'),
      ('بيتزا دجاج بالباربيكيو',          'بيتزا دجاج الباربيكيو', 'وسط',  'سميك'),
      ('بيتزا دجاج بالرانش',              'بيتزا تشكن رانش',       'وسط',  'سميك'),
      ('بيتزا دجاج مشوي',                 'بيتزا غريلد تشكن',      'وسط',  'سميك'),
      ('بيتزا بيبروني',                   'بيتزا بروني',           'وسط',  'سميك'),
      ('وجبة كنتاكي / 3 قطع',             'كنتاكي 3 قطع',          null,   null),
      ('وجبة كنتاكي / 5 قطع',             'كنتاكي 5 قطع',          null,   null),
      ('وجبة كنتاكي / 8 قطع',             'كنتاكي 8 قطع',          null,   null),
      ('وجبة كنتاكي / 15 قطعة',           'كنتاكي 15 قطعة',        null,   null),
      ('وجبة كنتاكي',                     'كنتاكي 3 قطع',          null,   null),
      ('وجبة ستربس / 3 قطع',              'ستربس 3 قطع',           null,   null),
      ('وجبة ستربس',                      'ستربس 3 قطع',           null,   null),
      ('ريزو ستيشن',                      'ريزو',                  null,   'ستيشن'),
      ('اجنحة دجاج مقرمشة / 5 قطع',       'أجنحة',                 null,   null),
      ('اجنحة دجاج مقرمشة',               'أجنحة',                 null,   null),
      ('قطع دجاج مسحب / 5 قطع',           'البونلس',               null,   null),
      ('قطع دجاج مسحب',                   'البونلس',               null,   null),
      ('فنكر بالدجاج',                    'جكن فرايز',             null,   null),
      ('فنكر بالشيتوس والدجاج',           'شيتو جكن فرايز',        null,   null),
      ('صلصة سويت تشيلي',                 'سويت جيلي',             null,   null),
      ('صلصة هني ماسترد',                 'عسل الخردل',            null,   null),
      ('ثومية',                           'ثوم',                   null,   null),
      ('صلصة باربيكيو',                   'باربيكيو',              null,   null),
      ('صلصة بافلو',                      'بوفالو',                null,   null),
      ('صلصة جبنة',                       'جبن',                   null,   null),
      ('صلصة رانش',                       'رانش',                  null,   null),
      ('المشروبات الغازية',               'ببسي',                  null,   null)
    ) as t(alias, item, variant, flavor)
  loop
    select id into v_item from public.menu_items where name_ar = r.item and is_active order by sort limit 1;
    if v_item is null then continue; end if;
    v_var := null;
    if r.variant is not null then
      select id into v_var from public.item_variants where item_id = v_item and name_ar = r.variant and is_active limit 1;
    end if;
    insert into public.partner_item_aliases(source, alias, alias_key, item_id, variant_id, flavor)
      values ('toters', r.alias, public.fold_ar(r.alias), v_item, v_var, r.flavor)
      on conflict do nothing;
  end loop;
end $$;

notify pgrst, 'reload schema';
