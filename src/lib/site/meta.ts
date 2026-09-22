import type { Metadata } from "next";
import { SITE, SITE_LANGS, type SiteLang } from "./copy";

/** وسوم الصفحة التعريفية لكل لغة: عنوانها، ووصفها، وأخواتها في اللغات الأخرى */
export function siteMetadata(lang: SiteLang): Metadata {
  const c = SITE[lang];
  const path = (l: SiteLang) => (l === "ar" ? "/" : `/${l}`);
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: {
      canonical: path(lang),
      languages: Object.fromEntries(SITE_LANGS.map((l) => [l, path(l)])),
    },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url: path(lang),
      siteName: "Station",
      images: [{ url: "/og-order.png", width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title: c.metaTitle, description: c.metaDescription, images: ["/og-order.png"] },
  };
}
