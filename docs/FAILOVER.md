# نسخة احتياطية جاهزة — التحويل حين يتوقف Netlify

**الفكرة:** الموقع نفسه يعمل على مضيفين في الوقت ذاته على قاعدة البيانات ذاتها (Supabase).
العنوان الذي تعرفه الأجهزة هو **دومين خاص** لا `netlify.app`، فالتحويل = تغيير سطر واحد في
DNS، والأجهزة والـQR وواتساب لا تتغيّر أبداً.

```
station-anbar.com  ──DNS──▶  Netlify (الأساسي)
                    └──عند التوقّف──▶  Render (الاحتياطي، نفس الكود ونفس القاعدة)
```

## التجهيز مرة واحدة (٣٠ دقيقة، كله بحساب thetop.ge@gmail.com)

### ١. الدومين على Cloudflare (~10$ سنوياً)
1. cloudflare.com ← حساب جديد ← **Domain Registration → Register** ← `station-anbar.com` (أو ما تختار).
2. بعد الشراء: **DNS → Records → Add**: نوع `CNAME`، الاسم `@`، الهدف `station-anbar.netlify.app`، **Proxied (السحابة برتقالية)**. وسجّل آخر: `www` → نفس الهدف.
3. **SSL/TLS → Overview → Full** (لا Flexible ولا Strict).

### ٢. Netlify يعرف الدومين
Site configuration → **Domain management → Add a domain** ← `station-anbar.com` ← Netlify يتحقق ويصدر الشهادة.
ثم Environment variables: `NEXT_PUBLIC_SITE_URL = https://station-anbar.com` ← Trigger deploy.

### ٣. Render — النسخة الاحتياطية (0$ على الخطة المجانية)
1. render.com ← Sign up with GitHub ← **New → Blueprint** ← مستودع `thetopge-prog/station` ← يقرأ `render.yaml`.
2. الصق المتغيّرات نفسها من Netlify (Site configuration → Environment variables) في الخانات. `NEXT_PUBLIC_SITE_URL` = `https://station-anbar.com`.
3. في `render.yaml` الخطة `starter` (7$)؛ للاحتياط المجاني غيّرها في لوحة Render إلى **Free** (تنام بعد 15 دقيقة خمول وتصحو خلال ~50 ثانية عند أول طلب — مقبول لاحتياط، لا لتشغيل دائم).
4. Render → Settings → **Custom Domains → Add** ← `station-anbar.com` (يقول «لم يُتحقق» ما دام DNS على Netlify — طبيعي؛ يتحقق لحظة التحويل).

### ٤. الأجهزة تعرف الدومين (مرة واحدة)
- جهاز الكاشير والشاشات: افتح `https://station-anbar.com` بدل رابط نتلفاي.
- جهاز توترز: تطبيق ستيشن ← العنوان `https://station-anbar.com/api/calls` ← حفظ.
- الردّ السريع `/طلب` في واتساب: `https://station-anbar.com/delivery`.
- Meta (بوت واتساب): Callback URL الجديد.
- أعد طباعة QR الطاولات من `/qr`.

## يوم التوقّف — التحويل (٦٠ ثانية من الهاتف)
1. Cloudflare ← DNS ← السجل `@` ← **Edit** ← الهدف من `station-anbar.netlify.app` إلى **`station-anbar.onrender.com`** ← Save. (وكذلك `www`.)
2. افتح `https://station-anbar.com` — أول فتحة قد تأخذ دقيقة إن كانت خدمة Render نائمة، ثم يعمل كل شيء: الكاشير، الطباعة، توترز، واتساب — بلا لمس أي جهاز.
3. حين يعود Netlify: أعد الهدف إلى `station-anbar.netlify.app`. (أو ابقَ على Render.)

## تلقائياً بلا يد؟
Cloudflare **Load Balancing** (5$/شهر): يفحص المضيفين كل دقيقة ويحوّل وحده حين يسقط الأساسي ويعيده حين يعود. يُضاف لاحقاً فوق ما سبق دون تغيير شيء آخر.

## ما لا يتأثر بالتحويل
قاعدة البيانات والصور والبوت والتقارير كلها على Supabase؛ المضيفان يقرآن ويكتبان المكان نفسه — لا نسخ ولا مزامنة ولا فقدان طلب.
