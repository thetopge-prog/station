/**
 * عنوان الموقع الواحد — بلا `www` وبلا خطٍّ مائل في آخره.
 *
 * جوجل يعدّ `stationiraq.com` و`www.stationiraq.com` موقعين، فيقسم ترتيب
 * الصفحة الواحدة بينهما. والقرار هنا مرّةً واحدة، ويقرؤه `robots` و`sitemap`
 * والبيانات المنظَّمة و`metadataBase` — فلا يختلف ملفٌّ عن أخيه.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://stationiraq.com").replace(/\/+$/, "");
