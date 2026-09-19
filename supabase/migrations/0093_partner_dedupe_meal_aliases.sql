-- 0093: طلبات الشركات — لا طلب مرتين، والساندويچ ليس وجبة.
--
-- ١) شاشتان لتوترز في الثانية نفسها أنشأتا #904 و#905 لطلب واحد. رقم الشركة
--    لا يتكرر في يوم العمل نفسه، فالقاعدة ترفض الثاني والمسار يلغيه.
create unique index if not exists orders_partner_ref_day_uq
  on public.orders (order_source, partner_ref, business_day)
  where partner_ref is not null and status <> 'cancelled';

-- ٢) الأسماء البديلة لتوترز رُبطت كلها بـ«وجبة» لأن الشاشة لم تكن تفرّق. الآن
--    المحلّل يحمل «/ وجبة» حين يضيف الزبون «اجعلها وجبة»؛ فالاسم المجرّد = ساندويچ،
--    والاسم مع «/ وجبه» = وجبة (يُبذر من الربط الحالي كي لا يُعاد الربط يدوياً).
insert into public.partner_item_aliases (source, alias, alias_key, item_id, variant_id, flavor)
select a.source, a.alias || ' / وجبة', a.alias_key || ' / وجبه', a.item_id, a.variant_id, a.flavor
  from public.partner_item_aliases a
  join public.item_variants v on v.id = a.variant_id
 where v.name_ar = 'وجبة' and a.alias_key not like '%وجبه%'
on conflict (source, alias_key) do nothing;

update public.partner_item_aliases a
   set variant_id = s.id
  from public.item_variants v
  join public.item_variants s on s.item_id = v.item_id and s.kind = 'size' and s.name_ar in ('ساندويچ','ساندويش','سندويش','سندويچ') and s.is_active
 where a.variant_id = v.id and v.name_ar = 'وجبة' and a.alias_key not like '%وجبه%';
