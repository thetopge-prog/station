import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { SITE } from "@/lib/site/copy";
import { SITE_URL } from "@/lib/site/url";

/**
 * صفحة «أفضل كنتاكي بالأنبار».
 *
 * صفحةٌ لسؤالٍ بعينه. الصفحة الرئيسية تعرّف المطعم كلّه، ومن يكتب في جوجل
 * «أفضل كنتاكي بالأنبار» يبحث عن جوابٍ لسؤاله هو — وجوجل يرتّب الصفحة التي
 * تجيب السؤال، لا التي تذكره.
 *
 * وما يجيبه هنا ليس كلمة «أفضل» بل ما تحتها: الزيت، والبهار، والأجهزة —
 * ثلاثة أشياء يقولها صاحب المطعم عن مطعمه، ولا يقولها غيره عن مطبخه. وهذا هو
 * الفرق بين صفحةٍ تُرتَّب وصفحةٍ تُهمَل.
 */
export const metadata: Metadata = {
  title: "أفضل كنتاكي بالأنبار — ستيشن الرمادي | زيت سعودي وبهار مستورد",
  description:
    "كنتاكي ستيشن في الرمادي: زيت قلي سعودي ١٠٠٪، وخلطة بهارات مستوردة من آسيا، وأجهزة قلي أمريكية. أول مطعم تقني في الأنبار — اطلب من هاتفك ويصل المطبخ في ثانية.",
  alternates: { canonical: "/kentucky" },
  openGraph: {
    title: "أفضل كنتاكي بالأنبار — ستيشن الرمادي",
    description: "زيت سعودي ١٠٠٪، بهار مستورد من آسيا، وأجهزة قلي أمريكية. في الرمادي، ومن هاتفك.",
    url: "/kentucky",
    siteName: "Station",
    images: [{ url: "/og-order.png", width: 1200, height: 630 }],
    type: "article",
    locale: "ar_IQ",
  },
};

/** ما يفرّق مقلاتنا عن غيرها — ثلاثة أشياء لا شعار */
const PILLARS = [
  {
    title: "زيت قلي سعودي ١٠٠٪",
    body: "نقلي بزيتٍ سعوديّ خالص، ويُبدَّل بجدولٍ مكتوب لا حين يسوء لونه. الزيت هو أوّل ما يُذاق في الدجاج المقلي وآخر ما يُنتبَه له — فمنه نبدأ.",
  },
  {
    title: "بهار مستورد من آسيا",
    body: "خلطة البهارات تصلنا من دولة آسيوية، وليس لها مثيل في العراق. هي سرّ الطعم الذي لا يُقلَّد، ولا تُباع في أي سوق محلّي.",
  },
  {
    title: "أجهزة قلي أمريكية",
    body: "مقالي الدجاج والبرجر عندنا من صنف الأجهزة التي تعمل بها المطاعم الأمريكية: ضغطٌ وحرارةٌ مضبوطان بالثانية، فتخرج القطعة مقرمشةً من الخارج وطريّةً من الداخل في كل مرّة، لا في بعض المرّات.",
  },
];

const STEPS = [
  "دجاج طازج يصلنا يومياً — لا مجمّد.",
  "يُتبَّل في مطبخنا بالخلطة المستوردة، لا يأتينا متبَّلاً.",
  "لا يُقلى إلا حين يصل طلبك — فلا شيء ينتظر على الرفّ.",
  "يُعبَّأ في علبةٍ تتنفّس، فيصلك مقرمشاً لا طريّاً بعد الطريق.",
];

const QA = [
  {
    q: "وين أفضل كنتاكي بالأنبار؟",
    a: "ستيشن في الرمادي — شارع المستودع، فلكة الفرسان. نقلي بزيت سعودي ١٠٠٪ وبخلطة بهارات مستوردة من آسيا، وعلى أجهزة قلي أمريكية، ولا يُقلى الدجاج إلا عند الطلب.",
  },
  {
    q: "شنو يفرّق كنتاكي ستيشن عن غيره؟",
    a: "ثلاثة أشياء: الزيت سعودي خالص ويُبدَّل بجدول، والبهار خلطة مستوردة لا تُباع في العراق، وأجهزة القلي من صنف أجهزة المطاعم الأمريكية — ضغطٌ وحرارةٌ مضبوطان فتتساوى كل قطعة مع أختها.",
  },
  {
    q: "الدجاج طازج لو مجمّد؟",
    a: "طازج يصلنا يومياً ويُتبَّل في مطبخنا، ولا يُقلى إلا حين يُطلب.",
  },
  {
    q: "اللحم والدجاج حلال؟",
    a: "نعم، كل لحومنا حلال ومن موردين معروفين، وتصلنا طازجة يومياً.",
  },
  {
    q: "شلون أطلب كنتاكي ستيشن؟",
    a: "من الموقع مباشرة: اختر أصنافك وأرسل، ويصل طلبك إلى شاشة المطبخ في ثانية. توصيل داخل الرمادي، أو استلام من المطعم، أو من سيارتك بلا نزول.",
  },
  {
    q: "شنو أوقات الدوام؟",
    a: "من السبت إلى الخميس من ٩:٠٠ صباحاً حتى ٣:٠٠ فجراً، ويوم الجمعة نفتح ١:٠٠ ظهراً حتى ٣:٠٠ فجراً. والطلب من الموقع متاح طوال هذه الساعات.",
  },
];

export default function KentuckyPage() {
  const c = SITE.ar;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/kentucky#faq`,
        mainEntity: QA.map((x) => ({
          "@type": "Question",
          name: x.q,
          acceptedAnswer: { "@type": "Answer", text: x.a },
        })),
      },
      {
        "@type": "Restaurant",
        "@id": `${SITE_URL}/#restaurant`,
        name: `${BRAND.nameAr} — ${BRAND.nameLatin}`,
        url: SITE_URL,
        telephone: `+964${BRAND.phoneDisplay.slice(1)}`,
        servesCuisine: ["Fried Chicken", "Fast Food"],
        priceRange: "$",
        address: {
          "@type": "PostalAddress",
          streetAddress: c.addressValue,
          addressLocality: "الرمادي",
          addressRegion: "الأنبار",
          addressCountry: "IQ",
        },
        hasMenu: `${SITE_URL}/menu`,
        geo: { "@type": "GeoCoordinates", latitude: BRAND.geo.lat, longitude: BRAND.geo.lng },
        hasMap: BRAND.mapsUrl,
        sameAs: [BRAND.mapsUrl],
      },
    ],
  };

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-5 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <p className="text-sm font-black text-primary">{BRAND.nameAr} — الرمادي، الأنبار</p>
      <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">أفضل كنتاكي بالأنبار</h1>
      <p className="mt-3 text-lg font-bold leading-relaxed text-muted-foreground">
        ستيشن هو <strong className="text-foreground">أول مطعم تقني في الأنبار</strong> — لا لأن فيه شاشة، بل لأن التقنية
        في كل ركنٍ منه: تطلب من هاتفك فيصل طلبك إلى شاشة المطبخ في ثانية، وتُطبع تذكرة التجهيز وحدها، ويخبرك واتساب حين
        يجهز. وما تحت هذا كلّه مطبخٌ يقلي بزيتٍ سعوديّ خالص وبهارٍ لا مثيل له في العراق.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/order" className="min-h-12 rounded-2xl bg-primary px-6 py-3 font-black text-primary-foreground">
          اطلب الآن
        </Link>
        <Link href="/menu" className="min-h-12 rounded-2xl border-2 border-border px-6 py-3 font-black">
          شوف المنيو
        </Link>
        <a href={`tel:${BRAND.phoneDisplay}`} className="min-h-12 rounded-2xl border-2 border-border px-6 py-3 font-black">
          <bdi dir="ltr">{BRAND.phoneDisplay}</bdi>
        </a>
      </div>

      <h2 className="mt-12 text-2xl font-black">ثلاثة أشياء لا يقولها غيرنا</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="rounded-2xl border-2 border-border bg-card p-4">
            <h3 className="text-base font-black text-primary">{p.title}</h3>
            <p className="mt-1.5 text-sm font-bold leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-black">كيف تُقلى القطعة عندنا</h2>
      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-3 rounded-2xl border-2 border-border bg-card p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-black text-primary-foreground">
              {i + 1}
            </span>
            <span className="font-bold leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 text-2xl font-black">أسئلة يسألها الناس</h2>
      <div className="mt-4 space-y-2">
        {QA.map((x) => (
          <details key={x.q} className="rounded-2xl border-2 border-border bg-card p-4">
            <summary className="cursor-pointer font-black">{x.q}</summary>
            <p className="mt-2 font-bold leading-relaxed text-muted-foreground">{x.a}</p>
          </details>
        ))}
      </div>

      {/* العنوان والهاتف والساعات مكتوبةً — هي ما يقرؤه البحث المحلّي، ولا
          تكفي فيها البيانات المنظَّمة وحدها */}
      <section className="mt-12 rounded-2xl border-2 border-primary bg-card p-5">
        <h2 className="text-xl font-black">زورنا</h2>
        <p className="mt-2 font-bold leading-relaxed">
          {c.addressValue}
          <br />
          {c.hoursValue}
          <br />
          <a href={`tel:${BRAND.phoneDisplay}`} className="font-black text-primary">
            <bdi dir="ltr">{BRAND.phoneDisplay}</bdi>
          </a>
        </p>
        <a
          href={BRAND.mapsUrl}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-block font-black text-primary underline"
        >
          الموقع على خرائط جوجل
        </a>
        <br />
        <Link href="/" className="mt-2 inline-block font-black text-primary underline">
          تعرّف على ستيشن كاملاً
        </Link>
      </section>
    </main>
  );
}
