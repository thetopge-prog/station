import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site/url";

/**
 * ما يُفهرَس وما لا يُفهرَس.
 *
 * بلا هذا الملفّ كان `/robots.txt` يُعاد توجيهه إلى صفحة الدخول — فيقرأ جوجل
 * تحويلاً لا قائمة، ويزحف على ما لا ينبغي أو يتردّد فيما ينبغي. (وقد أُضيف
 * `/robots.txt` و`/sitemap.xml` إلى المسارات العامّة في `proxy.ts` لهذا.)
 *
 * والمنع هنا ليس أمناً — الأمن في الخادم — بل توفيرُ زحفٍ يُصرَف على صفحاتٍ
 * لا تنفع أحداً في نتائج البحث: شاشات الموظفين، وواجهات البرمجة، وجدار
 * العرض، وشاشة الطابور المعلّقة في المحل.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/sign-in", "/wall", "/w1", "/w2", "/w3", "/w4", "/tv", "/queue", "/kiosk", "/card", "/scan"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
