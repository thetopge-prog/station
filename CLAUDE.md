# ستيشن (Station) — دليل العمل لكلود

نظام كاشير/مطبخ لمطعم وجبات سريعة في الرمادي. Next.js 16 + Supabase، عربي RTL. المالك يكتب بالعربية — أجب بالعربية دائماً، بتقرير مفهوم لا تقني.

## أين يعيش النظام
- **الأساس:** خادم المالك الخاص (Hostinger) — `https://station.187.124.112.104.sslip.io`. ينشر وحده: cron على الخادم يفحص `main` كل دقيقتين ويبني ويشغّل (`deploy/vps.sh`). **أي دفعة إلى `main` = نشر خلال دقيقتين.**
- احتياط: Vercel `station-anbar.vercel.app` (يبني عند كل دفعة)، Netlify `station-anbar.netlify.app` (يبني فقط إن حوت رسالة الدفعة `[deploy]`).
- قاعدة البيانات: Supabase مشروع `ahrxdwvxbykdktyclzdi`. الترحيلات في `supabase/migrations/NNNN_*.sql` وتُطبَّق بـ `node scripts/db-apply.mjs <file>` (يحتاج `SUPABASE_DB_URL` في البيئة أو `.env.local`).
- بوت تيليغرام: `supabase/functions/telegram-bot` — ينشر بـ `npx -y supabase@2.116.0 functions deploy telegram-bot --no-verify-jwt --project-ref ahrxdwvxbykdktyclzdi`.
- الحسابات كلها (Supabase، GitHub `thetopge-prog`، Netlify، Vercel) على Google: **thetop.ge@gmail.com** — اذكره كلما أرشدت المالك إلى لوحة منها.
- التفاصيل: `docs/FAILOVER.md` (الاستضافة)، `docs/HUB.md`، `docs/BACKUP.md`، `docs/MOVE-EU.md`.

## قواعد ثابتة من المالك
- لا تُدخل أي مفتاح/توكن/كلمة مرور/بطاقة في أي خانة أو ملف — المالك يلصقها بنفسه.
- لا تحذف حسابات موجودة. لا صلاحيات كاميرا/بصمة.
- الكاشير لا يرى الأرباح والمجاميع — يرى البيع وتسجيل المصروفات والديون فقط.
- الطابعات: الإيصال + تذكرة التجهيز على طابعة الكاونتر (POS80)؛ طابعة المطبخ (POS-24) تأخذ برجر/زنجر فقط (0085) مع صفّارة. أي تعديل طباعة يجب ألا يمسّ الطابعات الأخرى.
- الأسماء المقدّسة على الأوراق تُحجب (`holy-names.ts`).
- يوم العمل يُقطع 04:00 فجراً بغداد (`business_day_of()` / `businessDay()` — يُغيَّران معاً). قسم برجر/زنجر يغلق 02:00 (`late_cutoff`, `lateCutoffState`).
- طلبات توترز/طلباتي تصل من جهاز SUNMI عبر `/api/orders/external` (قراءة شاشة) — الأصناف تُربط في `/partners`؛ عدّل المحلّل في الخادم (`external-order.ts`) لا في التطبيق.
- ستيشن وبيتزارا مشروعان منفصلان؛ «المحطة التقنية» مشروع آخر.

## قبل الدفع
- `npx vitest run` (300+ اختبار) و`npx tsc --noEmit -p .` و`npx eslint` على الملفات المعدّلة.
- قواعد React 19: لا setState داخل effect بلا تعليق، لا `Date.now()` في الرندر (استخدم effect).
- رسالة الدفعة بالإنجليزية موجزة؛ أضف `[deploy]` فقط إن أردت نتلفاي أيضاً.
- الملفات بنهايات LF.
