# نسخة احتياطية جاهزة — التحويل حين يتوقف Netlify

**الفكرة:** الموقع نفسه يعمل على مضيفين في الوقت ذاته على قاعدة البيانات ذاتها (Supabase).
العنوان الذي تعرفه الأجهزة هو **دومين خاص** لا `netlify.app`، فالتحويل = تغيير سطر واحد في
DNS، والأجهزة والـQR وواتساب لا تتغيّر أبداً.

```
station-anbar.com  ──DNS──▶  Netlify (الأساسي)
                    └──عند التوقّف──▶  Vercel (الاحتياطي، نفس الكود ونفس القاعدة)
```

## التجهيز مرة واحدة (كله بحساب thetop.ge@gmail.com)

### ١. الدومين على Cloudflare (~10$ سنوياً)
1. cloudflare.com ← حساب جديد ← **Domain Registration → Register** ← `station-anbar.com` (أو ما تختار).
2. بعد الشراء: **DNS → Records → Add**: نوع `CNAME`، الاسم `@`، الهدف `station-anbar.netlify.app`، **Proxied (السحابة برتقالية)**. وسجّل آخر: `www` → نفس الهدف.
3. **SSL/TLS → Overview → Full** (لا Flexible ولا Strict).

### ٢. Netlify يعرف الدومين
Site configuration → **Domain management → Add a domain** ← `station-anbar.com` ← Netlify يتحقق ويصدر الشهادة.
ثم Environment variables: `NEXT_PUBLIC_SITE_URL = https://station-anbar.com` ← Trigger deploy.

### ٣. Vercel — النسخة الاحتياطية (0$، بلا بطاقة) ✅ منجَز
- المشروع `station-anbar` على vercel.com (تسجيل الدخول بـ GitHub، حساب thetop.ge@gmail.com)، فريق `station` خطة Hobby.
- يبني وحده عند كل دفعة إلى `main` (لا يحتاج `[deploy]` كنتلفاي) — الاحتياط دائماً بآخر كود.
- العنوان: **https://station-anbar.vercel.app** — يعمل الآن على القاعدة نفسها.
- Deployment Protection مطفأة (وإلا يطلب Vercel تسجيل دخول من كل زائر).
- المتغيّرات نفسها من `.env.local` + `NEXT_PUBLIC_SITE_URL`. تعديلها: Settings → Environment Variables → ثم Redeploy.
- Settings → **Domains → Add Existing** ← `station-anbar.com` (يقول «Invalid Configuration» ما دام DNS على Netlify — طبيعي؛ يصحّ لحظة التحويل).
- ملاحظة: شروط Hobby تمنع الاستخدام التجاري الدائم؛ كاحتياط طوارئ مقبول، وإن صار هو الأساسي لأسابيع فالأصح الترقية (20$/شهر) أو Render ببطاقة.

### ٤. الأجهزة تعرف الدومين (مرة واحدة)
- جهاز الكاشير والشاشات: افتح `https://station-anbar.com` بدل رابط نتلفاي.
- جهاز توترز: تطبيق ستيشن ← العنوان `https://station-anbar.com/api/calls` ← حفظ.
- الردّ السريع `/طلب` في واتساب: `https://station-anbar.com/delivery`.
- Meta (بوت واتساب): Callback URL الجديد.
- أعد طباعة QR الطاولات من `/qr`.

## يوم التوقّف — التحويل (٦٠ ثانية من الهاتف)
1. Cloudflare ← DNS ← السجل `@` ← **Edit** ← الهدف من `station-anbar.netlify.app` إلى **`cname.vercel-dns.com`** ← Save. (وكذلك `www`.)
2. افتح `https://station-anbar.com` — يعمل فوراً (Vercel لا ينام): كل شيء: الكاشير، الطباعة، توترز، واتساب — بلا لمس أي جهاز.
3. حين يعود Netlify: أعد الهدف إلى `station-anbar.netlify.app`. (أو ابقَ على Vercel.)

## تلقائياً بلا يد؟
Cloudflare **Load Balancing** (5$/شهر): يفحص المضيفين كل دقيقة ويحوّل وحده حين يسقط الأساسي ويعيده حين يعود. يُضاف لاحقاً فوق ما سبق دون تغيير شيء آخر.

## ما لا يتأثر بالتحويل
قاعدة البيانات والصور والبوت والتقارير كلها على Supabase؛ المضيفان يقرآن ويكتبان المكان نفسه — لا نسخ ولا مزامنة ولا فقدان طلب.
