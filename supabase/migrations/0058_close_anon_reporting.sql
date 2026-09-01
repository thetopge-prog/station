-- أرباح المحل كانت مقروءة لأي شخص على الإنترنت.
--
-- المفتاح العام (anon) موجود داخل صفحة الموقع — يفتحها أي زائر ويقرؤه من
-- مصدر الصفحة. وبه وحده كان هذا يعمل، جرّبتُه:
--
--   POST /rest/v1/rpc/range_summary  {"p_from":"2026-08-01","p_to":"2026-09-30"}
--   → 200  [{"day":"…","sales":…,"profit":…,"expenses":…,"net":…}, …]
--
-- مبيعات وأرباح ومصاريف وصافي كل يوم، لأي مدى تاريخي، لأي أحد. ومعها
-- guest_estimate: عدد الزبائن.
--
-- والجداول لم تكن هي الثقب — orders و till_pins ردّتا 401، و employees و
-- customers و expenses رجعت فارغة لأن RLS يحجبها. الثقب دالّتان
-- SECURITY DEFINER — تتجاوزان الحماية عمداً، وهذا صحيح لأن التقارير تحتاجه —
-- مُنِح anon حقّ تنفيذهما.
--
-- ولا شيء يكسره هذا السحب: كل مستدعٍ في التطبيق يمرّ بمفتاح الخدمة
-- (daily-count.ts:68,73 و dashboard-actions.ts:22,35,96)، حتى أن التعليق في
-- dashboard-actions.ts:18 يقول «range_summary service-role-only» — وهي النيّة
-- التي لم تطابقها الصلاحية يوماً. authenticated تبقى كما هي.

revoke execute on function public.range_summary(date, date) from anon;
revoke execute on function public.guest_estimate(date, date) from anon;

-- وسحبها من PUBLIC أيضاً.
--
-- هذا هو الدرس المكتوب في 0042_function_grants.sql: منح الدالة يذهب ضمنياً إلى
-- PUBLIC، فسحبها من anon وحده يترك الباب مفتوحاً لأن anon عضو في PUBLIC.
-- guest_estimate تحديداً كان صفّها `=X/postgres` — أي PUBLIC، لا anon.
revoke execute on function public.range_summary(date, date) from public;
revoke execute on function public.guest_estimate(date, date) from public;

grant execute on function public.range_summary(date, date) to authenticated, service_role;
grant execute on function public.guest_estimate(date, date) to authenticated, service_role;
