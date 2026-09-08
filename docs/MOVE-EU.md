# نقل ستيشن إلى فرانكفورت — دفتر التنفيذ

**لماذا:** قاعدة البيانات في سيدني (~٢٩٥ مللي ثانية من الرمادي) وخوادم Netlify في أوهايو؛ البيعة تسأل القاعدة ~١٢ مرّة متتابعة. فرانكفورت ~٨٠ مللي ثانية من الرمادي و~١٠٠ من أوهايو.

**المبدأ:** القديم لا يُمسّ. الجديد يُبنى بجانبه، والتحويل تبديل ثلاثة متغيّرات في Netlify. الرجوع = إعادتها.

## قبل الإغلاق (بلا أثر)
1. مشروع Supabase جديد `station-eu` في **Frankfurt**؛ قيمه في `.env.local` باسم `EU_*` (أربعة أسطر).
2. `node scripts/migrate-eu.mjs schema` — الترحيلات كلها على الجديد.
3. Edge function: `npx -y supabase@2.116.0 functions deploy telegram-bot --no-verify-jwt --project-ref <EU-REF>` ثم الأسرار نفسها (`STATION_WEBHOOK_SECRET`, `STATION_SITE_URL`, توكن البوت) على المشروع الجديد من لوحة Supabase → Edge Functions → Secrets.

## بعد الإغلاق (~٤٠ دقيقة)
4. `node scripts/migrate-eu.mjs data` — الجداول والمعرّفات وحسابات الموظفين.
5. `node scripts/migrate-eu.mjs storage` — الصور.
6. `node scripts/migrate-eu.mjs verify` — يجب أن يطبع «كل شيء متطابق».
7. Netlify → Site configuration → Environment variables: بدّل
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
   إلى قيم `EU_*`. ثم Deploys → **Trigger deploy → Clear cache and deploy**.
8. Telegram webhook يشير إلى Edge function المشروع الجديد (`setWebhook` بالرابط الجديد) — يُنفَّذ من `scripts/bot.mjs` أو يدوياً.
9. **اختبار القبول** على الموقع الحيّ: دخول موظف ← بيع نقدي ← الإيصال وتذكرة التجهيز تخرج ← المجهّز يمسح ← «جاهز». قياس زمن البيعة.
10. نجاح ⇒ يبقى القديم أسبوعاً احتياطاً ثم يُوقف. فشل ⇒ الخطوة ٧ بالقيم القديمة.

## ما يبقى على القديم مؤقتاً
- `/img/*` في `netlify.toml` يشير إلى تخزين المشروع القديم — يُبدَّل إلى الجديد في نفس النشر (الخطوة ٧).
- لا يتغيّر رابط الموقع؛ SUNMI والكاشير والبوت كما هم.

## لاحقاً (ليلة أخرى)
نقل الاستضافة إلى Vercel فرانكفورت — يغيّر رابط الموقع؛ يمسّ سطر `/setup` على الكاشير، عنوان SUNMI، `STATION_SITE_URL` للبوت، وتحويلة `/apk`.
