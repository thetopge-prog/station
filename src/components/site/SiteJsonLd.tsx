import { BRAND } from "@/lib/brand";
import { SITE, type SiteLang } from "@/lib/site/copy";
import { SITE_URL } from "@/lib/site/url";

/**
 * البيانات المنظَّمة — ما يقرؤه جوجل عن المطعم، لا ما يقرؤه الزائر.
 *
 * الصفحة تقول للإنسان «الرمادي، شارع المستودع، كل يوم ٩ صباحاً حتى ٣ فجراً».
 * ومحرّك البحث لا يقرأ الجملة، يقرأ الحقول. وبها يظهر المطعم في بطاقة الخريطة
 * وفي نتيجةٍ فيها العنوان والساعات والهاتف بدل سطرٍ أزرق وحده — وهذا أكبر
 * فرقٍ يصنعه الموقع في بحثٍ محلّي.
 *
 * وكل رقمٍ هنا مأخوذ من `BRAND` ومن نصّ الصفحة نفسها: بيانٌ يخالف ما على
 * الشاشة يضرّ ولا ينفع.
 *
 * والأسئلة الشائعة تُرسَل كما هي مكتوبة على الصفحة — شرط جوجل أن يكون الجواب
 * ظاهراً للزائر، وهو كذلك.
 */
export function SiteJsonLd({ lang }: { lang: SiteLang }) {
  const c = SITE[lang];

  const restaurant = {
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#restaurant`,
    name: `${BRAND.nameAr} — ${BRAND.nameLatin}`,
    alternateName: [BRAND.nicknameAr, BRAND.nameLatin],
    description: c.metaDescription,
    slogan: c.tagline,
    url: SITE_URL,
    telephone: `+964${BRAND.phoneDisplay.slice(1)}`,
    image: `${SITE_URL}/og-order.png`,
    // مطعم وجبات سريعة: تصنيفٌ أدقّ يضع البطاقة في السياق الصحيح
    servesCuisine: ["Fried Chicken", "Pizza", "Burgers", "Fast Food"],
    priceRange: "$",
    currenciesAccepted: "IQD",
    paymentAccepted: "Cash, Qi Card",
    address: {
      "@type": "PostalAddress",
      streetAddress: c.addressValue,
      addressLocality: "الرمادي",
      addressRegion: "الأنبار",
      addressCountry: "IQ",
    },
    areaServed: { "@type": "City", name: "الرمادي" },
    geo: { "@type": "GeoCoordinates", latitude: BRAND.geo.lat, longitude: BRAND.geo.lng },
    // بطاقة الخريطة والصفحة شيءٌ واحد — وهذا ما يجمع تقييمات البطاقة بنتيجة
    // الموقع بدل أن يقف كلٌّ منهما وحده
    hasMap: BRAND.mapsUrl,
    sameAs: [BRAND.mapsUrl],
    // من ٩ صباحاً إلى ٣ فجراً — يُكتب بيومين لأن الإغلاق بعد منتصف الليل
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "09:00",
        closes: "03:00",
      },
    ],
    hasMenu: `${SITE_URL}/menu`,
    acceptsReservations: "False",
    /*
     * طرق الاستلام وخصائص المكان — حقولٌ لا جُمَل.
     *
     * سأل المالك مساعداً ذكياً عن المطعم فردّ بسؤال: «هل تقصد ميزة تقنية
     * معيّنة؟». والسبب أن هذه الأشياء كانت مكتوبةً للإنسان وحده — فقرةً في
     * «من نحن» — ولا شيء منها في صيغةٍ تُقرأ آلياً. وهذه هي الصيغة.
     */
    hasDeliveryMethod: [
      "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
      "http://purl.org/goodrelations/v1#DeliveryModePickUp",
    ],
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "الطلب الذاتي من الهاتف", value: true },
      { "@type": "LocationFeatureSpecification", name: "الاستلام من السيارة", value: true },
      { "@type": "LocationFeatureSpecification", name: "الطلب من الطاولة برمز QR", value: true },
      { "@type": "LocationFeatureSpecification", name: "التوصيل داخل الرمادي", value: true },
    ],
    potentialAction: {
      "@type": "OrderAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/order`, inLanguage: lang },
    },
  };

  const faq = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: c.faq.map((q) => ({
      "@type": "Question",
      name: q.q,
      acceptedAnswer: { "@type": "Answer", text: q.a },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // بيانات نكتبها نحن، لا مدخلات زائر — والتسلسل عبر JSON.stringify
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": [restaurant, faq] }) }}
    />
  );
}
