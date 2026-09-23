// صور جدار العرض: تُنزَّل مرّة، تُصغَّر، وتُحفظ عندنا.
//
// المالك أذِن مالكُ الصور باستعمالها بشرط رفعها على خوادمنا وألّا تُقرأ من
// الموقع الأصلي وقت التشغيل. فهذا السكربت هو تنفيذ ذلك الشرط: يُشغَّل مرّة،
// والنسخة النهائية لا تلمس ذلك الموقع أبداً.
//
// وثلاث قواعد مكتسَبة بثمن، لا اجتهاد:
//
// 1. المجلَّد ليس `ads` ولا شيئاً يشبهه — متصفّح التلفزيون يحجب كل مسارٍ فيه
//    تلك الكلمة، وقد كلّفت يوماً كاملاً (انظر scripts/ads-to-static.mjs).
// 2. ولا `public/wall/` — ملفٌّ ساكن يغلب مساراً ديناميكياً، فكان يحجب
//    /wall/1 نفسها. فـ`public/wallimg/`.
// 3. ولا عبر `/img/*` إلى تخزين Supabase — التلفزيون يُسقط تلك الردود.
//
// والميزانية ليست رأياً: ٢٫٩ ميغابايت سقطت فعلاً على واي‑فاي المحل، فالهدف
// أن تبقى الدورة كلّها دون ١٫٢م.
//
//   node scripts/wall-assets.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const SRC = "https://www.superchicken-iq.com/wp-content/uploads";
const OUT = "public/wallimg";

/**
 * الشفافية ليست تفضيلاً هنا: طبقات البركر مقصوصة تتراكب فوق بعضها، وJPEG بلا
 * قناة شفافية أصلاً. فما يحتاجها WebP، وما لا يحتاجها JPEG أساسي — وقد ثبت
 * أن progressive غير موثوق على فاكّات ترميز التلفزيونات.
 */
const FILES = [
  // طبقات البركر — من الأسفل إلى الأعلى، وكلّها بشفافية
  { url: `${SRC}/2025/04/Layer-01.webp`, name: "burger-1.webp", alpha: true, w: 1100, trim: true },
  { url: `${SRC}/2025/04/Layer-02.webp`, name: "burger-2.webp", alpha: true, w: 1100, trim: true },
  { url: `${SRC}/2025/04/Layer-03.webp`, name: "burger-3.webp", alpha: true, w: 1100, trim: true },
  { url: `${SRC}/2025/04/Layer-04.webp`, name: "burger-4.webp", alpha: true, w: 1100, trim: true },
  { url: `${SRC}/2025/04/Layer-05.webp`, name: "burger-5.webp", alpha: true, w: 1100, trim: true },
  { url: `${SRC}/2025/04/Layer-06.webp`, name: "burger-6.webp", alpha: true, w: 1100, trim: true },
  // الأصناف المفردة — تمرّ فوق خلفيات ملوّنة فتحتاج الشفافية كذلك
  { url: `${SRC}/2025/03/home-pruger-768x768.png`, name: "burger-whole.webp", alpha: true, w: 900 },
  { url: `${SRC}/2025/03/%D8%B1%D9%8A%D8%B2%D9%88-%D8%B3%D9%88%D8%A8%D8%B1-%D8%AC%D9%83%D9%86-copy-768x768.webp`, name: "rizo.webp", alpha: true, w: 900 },
  { url: `${SRC}/2025/03/Rizo-Motion-copy.webp`, name: "rizo-motion.webp", alpha: true, w: 900 },
  { url: `${SRC}/2025/03/333-768x905.png`, name: "chicken.webp", alpha: true, w: 800 },
];

mkdirSync(OUT, { recursive: true });

let total = 0;
for (const f of FILES) {
  const res = await fetch(f.url);
  if (!res.ok) {
    console.log(`✗ ${f.name}  ${res.status}`);
    continue;
  }
  const src = Buffer.from(await res.arrayBuffer());
  // طبقات البركر تُقصّ إلى محتواها.
  //
  // كلٌّ منها مُصدَّرةٌ بحشوٍ شفّافٍ مختلف، فإعطاؤها عرضاً واحداً يُصغّر محتوى
  // هذه ويُكبّر محتوى تلك — وحين تُكدَّس لا تُبنى بركراً بل تتناثر. والقصّ
  // يجعل حدود الصورة حدودَ المكوّن نفسه، فيصير تركيبها حساباً لا تخميناً.
  const base = f.trim ? sharp(src).trim({ threshold: 6 }) : sharp(src);
  const img = base.resize(f.w, f.w, { fit: "inside", withoutEnlargement: true });
  // الجودة ٧٢: تحت السبعين تظهر الحلقات على تدرّجات الصلصة، وفوق الثمانين
  // تتضاعف الكيلوبايتات بلا فرقٍ يُرى من بُعد ثلاثة أمتار
  const out = await (f.alpha ? img.webp({ quality: 72 }) : img.jpeg({ quality: 80, progressive: false })).toBuffer();
  writeFileSync(`${OUT}/${f.name}`, out);
  total += out.length;
  console.log(`✓ ${f.name}  ${(src.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`);
}

// ── أصناف المنيو بصورها ──────────────────────────────────────────────────
// أسماء الملفّات عربية على الخادم الأصلي، فتُرمَّز في الرابط. وتُقصّ إلى
// محتواها: كلٌّ منها مُصدَّرةٌ بحشوٍ مختلف، فصفٌّ بارتفاعٍ واحد يُظهر هذا
// كبيراً وذاك صغيراً ما لم تُقصّ.
const DISHES = [
  ["كنتاكي", "kentucky"], ["زنكر", "zinger"], ["ببروني", "pepperoni"],
  ["كرسبي-فرايز", "fries"], ["حلقات-بصل-1", "onion"], ["ستربس-1", "strips"],
  ["تويستر-كلاسك", "twister"], ["ريزو-سوبر", "rizo-super"], ["سوبر-صوص", "sauce"],
  ["مقبلات", "sides"], ["بوب-كورن-1", "popcorn"], ["مشروم-جكن", "mushroom"],
];
for (const [ar, en] of DISHES) {
  const res = await fetch(`${SRC}/2025/03/${encodeURIComponent(ar)}.webp`);
  if (!res.ok) {
    console.log(`✗ dish-${en}  ${res.status}`);
    continue;
  }
  const out = await sharp(Buffer.from(await res.arrayBuffer()))
    .trim({ threshold: 6 })
    .resize(460, 460, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 66 })
    .toBuffer();
  writeFileSync(`${OUT}/dish-${en}.webp`, out);
  total += out.length;
  console.log(`✓ dish-${en}.webp  ${(out.length / 1024).toFixed(0)}KB`);
}

// ── ملصقات المحلّ، مصغَّرةً للجدار ────────────────────────────────────────
// الأصول في `public/posters/` تخدم صفحاتٍ أخرى بحجمها الكامل — ١٫٤ ميغابايت
// للتسعة. والجدار يعرضها بنحو ٥٤٠ بكسل عرضاً، فحملُ الأصل كلّه على واي‑فاي
// المحل هو بالضبط العطل الذي أسقط تسع صورٍ من قبل. تُصغَّر هنا مرّة وتُقرأ
// من `wallimg/` وحدها.
for (const n of [1, 2, 3, 4, 5, 6, 7, "m1", "m2"]) {
  const out = await sharp(`public/posters/${n}.jpg`)
    .resize(760, 760, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 66 })
    .toBuffer();
  writeFileSync(`${OUT}/poster-${n}.webp`, out);
  total += out.length;
  console.log(`✓ poster-${n}.webp  ${(out.length / 1024).toFixed(0)}KB`);
}

// ── مسبارا بطاقة الفحص ─────────────────────────────────────────────────────
// صغيران عمداً: المقصود هل يفكّ التلفزيون الترميز، لا كم يحتمل من بايتات.
// وذو الشفافية مشتقٌّ من طبقةٍ حقيقية لا من مربّعٍ مصنوع، كي يكون المسبار
// اختباراً لما سيُعرض فعلاً.
const probeSrc = Buffer.from(await (await fetch(`${SRC}/2025/04/Layer-06.webp`)).arrayBuffer());
const alpha = await sharp(probeSrc).resize(260, 260, { fit: "inside" }).webp({ quality: 70 }).toBuffer();
writeFileSync(`${OUT}/probe-alpha.webp`, alpha);
const flat = await sharp(probeSrc)
  .resize(260, 260, { fit: "inside" })
  .flatten({ background: "#2c1e16" })
  .webp({ quality: 70 })
  .toBuffer();
writeFileSync(`${OUT}/probe.webp`, flat);
total += alpha.length + flat.length;
console.log(`✓ probe-alpha.webp  ${(alpha.length / 1024).toFixed(0)}KB`);
console.log(`✓ probe.webp  ${(flat.length / 1024).toFixed(0)}KB`);

const kb = total / 1024;
console.log(`\nالمجموع ${kb.toFixed(0)}KB  ${kb > 1200 ? "⚠ فوق الميزانية (1200KB)" : "✓ داخل الميزانية"}`);
