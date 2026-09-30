-- سجلّ تغيّر الأسعار — كي يكون للنزول سببٌ يُثبَت لا يُخمَّن.
--
-- شاشة «مراقبة المطبخ» تسأل: لماذا نزل هذا القسم؟ والنظام اليوم لا يعرف
-- الجواب، لأنه لا يسجّل شيئاً عن التغيير: لا سعراً قديماً، ولا من غيّره، ولا
-- متى. فحين ارتفعت أسعار ٣١ صنفاً يوم ٢٩ أيلول لم يبقَ منها في القاعدة إلا
-- السعر الجديد — وكأنه كان كذلك دائماً.
--
-- ومن غير هذا السجلّ تبقى كل إجابة تخميناً. **وسببٌ مخترع أسوأ من لا سبب:**
-- يُغلق البحث على الجواب الخطأ، فتُغيَّر وصفةٌ لا عيب فيها بينما السبب ٥٠٠
-- دينار أُضيفت للسعر.
--
-- ويُكتب بمُشغِّل لا بيد التطبيق: السعر يتغيّر من شاشة المنيو، ومن شاشة
-- الطلاب، ومن ترحيلٍ يكتبه أحدنا مباشرةً على القاعدة — وثلاثتها يجب أن
-- تُسجَّل. وما يُترك للنداء اليدوي يُنسى في المسار الرابع.

create table if not exists public.price_log (
  id bigserial primary key,
  item_id uuid references public.menu_items(id) on delete cascade,
  variant_id uuid references public.item_variants(id) on delete cascade,
  /** الاسم وقتَ التغيير: الصنف قد يُعاد تسميته بعدها، والسجلّ يبقى مقروءاً */
  name_ar text not null,
  kind text not null check (kind in ('price', 'student_price')),
  old_price int,
  new_price int,
  /** من غيّره إن كان من داخل التطبيق. فارغ = ترحيلٌ أو تغييرٌ مباشر */
  changed_by uuid references public.employees(id) on delete set null,
  at timestamptz not null default now(),
  business_day date not null default public.business_day_of(now())
);

create index if not exists price_log_day_idx on public.price_log(business_day);
create index if not exists price_log_item_idx on public.price_log(item_id);

comment on table public.price_log is
  'كل تغيّر سعر: القديم والجديد ومتى. مصدر «الأسباب» في شاشة مراقبة المطبخ.';

-- ── المُشغِّلات ─────────────────────────────────────────────────────────
create or replace function public.log_item_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_by uuid;
begin
  select e.id into v_by from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  if new.price is distinct from old.price then
    insert into price_log (item_id, name_ar, kind, old_price, new_price, changed_by)
      values (new.id, new.name_ar, 'price', old.price, new.price, v_by);
  end if;
  if new.student_price is distinct from old.student_price then
    insert into price_log (item_id, name_ar, kind, old_price, new_price, changed_by)
      values (new.id, new.name_ar, 'student_price', old.student_price, new.student_price, v_by);
  end if;
  return new;
end $$;

create or replace function public.log_variant_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_by uuid; v_name text;
begin
  select e.id into v_by from employees e where e.auth_user_id = auth.uid() and e.is_active limit 1;
  select m.name_ar || ' - ' || new.name_ar into v_name from menu_items m where m.id = new.item_id;
  if new.price_override is distinct from old.price_override then
    insert into price_log (item_id, variant_id, name_ar, kind, old_price, new_price, changed_by)
      values (new.item_id, new.id, coalesce(v_name, new.name_ar), 'price', old.price_override, new.price_override, v_by);
  end if;
  if new.student_price is distinct from old.student_price then
    insert into price_log (item_id, variant_id, name_ar, kind, old_price, new_price, changed_by)
      values (new.item_id, new.id, coalesce(v_name, new.name_ar), 'student_price', old.student_price, new.student_price, v_by);
  end if;
  return new;
end $$;

drop trigger if exists trg_log_item_price on public.menu_items;
create trigger trg_log_item_price after update on public.menu_items
  for each row execute function public.log_item_price();

drop trigger if exists trg_log_variant_price on public.item_variants;
create trigger trg_log_variant_price after update on public.item_variants
  for each row execute function public.log_variant_price();

notify pgrst, 'reload schema';
