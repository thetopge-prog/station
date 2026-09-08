-- ═══ إغلاق ما يمنحه سوبابيس افتراضياً للأدوار العامة ═══
--
-- كل جديد في public يُمنح لـ anon و authenticated كل الصلاحيات افتراضياً،
-- وكل دالة SECURITY DEFINER تُنفَّذ باسم مالكها. ما حمى المحل حتى الآن هو
-- RLS على الجداول والحرّاس داخل الدوال (is_staff/is_admin). ثلاث فجوات بقيت:
--
--  ١. عروض بسيطة قابلة للتحديث يملكها postgres: الكتابة عبرها تتجاوز RLS —
--     حامل المفتاح العام يضع سعر عرض لأي صنف أو يحذف العروض.
--  ٢. دوال DEFINER بلا حارس داخلي تُستدعى من عميل الخدمة وحده، لكنها ممنوحة
--     للعامّة: تعديل مخطّط الطاولات، فتح/إغلاق حضور أي موظف، أرقام الشركات.
--  ٣. منح كتابة لـ anon على الجداول نفسها — RLS يصدّها اليوم، لكن لا سبب لبقائها.
--
-- ما يبقى للعامّة عمداً: place_order, create_card, get_card, get_orders_public —
-- مسار الكيوسك والمنيو يعمل باسم anon، وحرّاسها داخلها.

-- ١
revoke insert, update, delete, truncate, references, trigger
  on public.active_offers, public.active_item_offers,
     public.menu_public, public.variant_public, public.queue_public
  from anon, authenticated;

-- ٢
revoke execute on function
  public.attendance_open(uuid, text),
  public.attendance_close(uuid),
  public.attendance_autoclose(),
  public.save_cafe_tables(jsonb),
  public.daily_partner_breakdown(date),
  public.rls_auto_enable(),
  public.chef_picks(integer)
  from anon, authenticated, public;

-- ٣
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';
