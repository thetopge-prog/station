import type { MetadataRoute } from "next";
import { SITE_LANGS, bcp47 } from "@/lib/site/copy";
import { SITE_URL } from "@/lib/site/url";

/**
 * خريطة الموقع — الصفحات التي نريد أن تُفهرَس، لا كل ما يردّ ٢٠٠.
 *
 * الصفحة التعريفية بلغاتها الخمس، وصفحة الكنتاكي، وشاشة الاستلام، والمنيو.
 * وما عداها (شاشات الموظفين، الجدار، الطابور) ليس محتوىً يبحث عنه أحد.
 *
 * و`alternates.languages` تربط ترجمات الصفحة الواحدة ببعضها، فيعرف جوجل أنها
 * صفحةٌ واحدة بخمس لغات لا خمس صفحات متشابهة.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const path = (l: (typeof SITE_LANGS)[number]) => (l === "ar" ? "/" : `/${l}`);
  const languages = Object.fromEntries(SITE_LANGS.map((l) => [bcp47(l), `${SITE_URL}${path(l)}`]));

  return [
    ...SITE_LANGS.map((l) => ({
      url: `${SITE_URL}${path(l)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: l === "ar" ? 1 : 0.8,
      alternates: { languages },
    })),
    { url: `${SITE_URL}/kentucky`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.9 },
    { url: `${SITE_URL}/order`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 },
    { url: `${SITE_URL}/menu`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.1 },
  ];
}
