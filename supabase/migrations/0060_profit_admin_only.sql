-- الأرباح للإدارة وحدها — بما فيها عطلٌ صنعتُه بنفسي.
--
-- صاحب المحل: «لا أريد الأرباح تظهر في حساب الكاشير». والكاشير اليوم لا يراها
-- على الشاشة فحسب — بل **يسحبها** من أدوات المطوّر، لأن جلسته جلسة قاعدة بيانات
-- حقيقية، وكل ما مُنح لـ`authenticated` يبعد عنه طلبَ fetch واحداً.
--
-- وأولها عطلٌ أدخلتُه أنا في 0058: أغلقتُ ثغرة `anon` على range_summary
-- ووسّعتُ المنح في الوقت نفسه من `service_role` وحده إلى `authenticated`
-- أيضاً. فأغلقتُ باباً وفتحتُ آخر. التعليق في dashboard-actions.ts ما زال
-- يقول «range_summary is service-role-only» — وقد صار كاذباً بيدي.
--
-- ولا شيء في التطبيق يكسره هذا: كل مستدعٍ يمرّ بمفتاح الخدمة بعد
-- requireAdmin — وقد نقلتُ getBep و getRecommendations إلى مفتاح الخدمة في
-- هذا الترحيل نفسه، إذ كانتا الوحيدتين اللتين تستعملان جلسة المستخدم.

-- ما تكشفه كل واحدة لو بقيت مفتوحة:
--   range_summary      مبيعات وأرباح وصافي كل يوم، لأي مدى تاريخي
--   bep_today          الإيراد والكلفة والربح الإجمالي
--   daily_fixed_cost   حصة الإيجار + **رواتب كل الموظفين**
--   stock_value        قيمة المخزون
--   recommended_items  هامش كل صنف
--   guest_estimate     عدد الزبائن
revoke execute on function public.range_summary(date, date) from authenticated;
revoke execute on function public.guest_estimate(date, date) from authenticated;
revoke execute on function public.bep_today() from authenticated;
revoke execute on function public.daily_fixed_cost() from authenticated;
revoke execute on function public.stock_value() from authenticated;
revoke execute on function public.recommended_items(integer) from authenticated;

-- وسحبها من PUBLIC أيضاً — الدرس المكتوب في 0042: المنح يذهب ضمنياً إلى
-- PUBLIC، و`authenticated` عضو فيه، فسحبه من الدور وحده يترك الباب موارباً.
revoke execute on function public.range_summary(date, date) from public;
revoke execute on function public.guest_estimate(date, date) from public;
revoke execute on function public.bep_today() from public;
revoke execute on function public.daily_fixed_cost() from public;
revoke execute on function public.stock_value() from public;
revoke execute on function public.recommended_items(integer) from public;

grant execute on function public.range_summary(date, date) to service_role;
grant execute on function public.guest_estimate(date, date) to service_role;
grant execute on function public.bep_today() to service_role;
grant execute on function public.daily_fixed_cost() to service_role;
grant execute on function public.stock_value() to service_role;
grant execute on function public.recommended_items(integer) to service_role;

-- menu_margins: كلفة كل صنف وهامشه، لكل صنف مفعّل، بجدول واحد.
-- لا يقرؤه التطبيق إطلاقاً — الإشارة الوحيدة إليه تعليق في bep-actions.ts.
revoke select on public.menu_margins from authenticated, anon;

-- bep_today: كان يحرس نفسه بـ is_staff()، وهو حارس لا يمرّ منه **مفتاح الخدمة**
-- نفسه لأن auth.uid() فارغ معه. فبعد أن صارت الدالة لخدمة الخادم وحدها، صار
-- ذلك الحارس يمنع المستدعي الشرعي الوحيد ويمرّر لا أحد.
--
-- والمنح هو البوّابة الآن — وهو ما تعتمد عليه شقيقاتها الخمس أصلاً
-- (range_summary وأخواتها بلا حارس داخلي منذ اليوم الأول). فليكن نمطاً واحداً
-- بدل نمطين، وليقف حارس الدور في التطبيق حيث requireAdmin.
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
  where o.business_day = (now() at time zone 'Asia/Baghdad')::date
    and o.status = 'paid';

  fixed_cost := v_fixed.total;
  configured := v_fixed.configured;
  gross_profit := revenue - cogs;
  remaining := greatest(0, v_fixed.total - (revenue - cogs));
  met := v_fixed.configured and (revenue - cogs) >= v_fixed.total;
  return next;
end $fn$;

revoke execute on function public.bep_today() from authenticated, public;
grant execute on function public.bep_today() to service_role;
