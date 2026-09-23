import type { Metadata } from "next";
import { bcp47, SITE, SITE_LANGS, type SiteLang } from "./copy";

/** وسوم الصفحة التعريفية لكل لغة: عنوانها، ووصفها، وأخواتها في اللغات الأخرى */
export function siteMetadata(lang: SiteLang): Metadata {
  const c = SITE[lang];
  const path = (l: SiteLang) => (l === "ar" ? "/" : `/${l}`);
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: {
      canonical: path(lang),
      // x-default للزائر الذي لا تطابق لغتُه أياً منها — وإلا اختار جوجل عنه
      languages: { ...Object.fromEntries(SITE_LANGS.map((l) => [bcp47(l), path(l)])), "x-default": "/" },
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
