import type { Metadata } from "next";
import { StationSite } from "@/components/site/StationSite";
import { siteMetadata } from "@/lib/site/meta";
import { SiteJsonLd } from "@/components/site/SiteJsonLd";

/** الصفحة الرئيسية = الصفحة التعريفية بالعربية. اللغات الأخرى على /en /tr /it /ku */
export const metadata: Metadata = siteMetadata("ar");

export default function Home() {
  return (
    <>
      {/* ما يقرؤه جوجل عن المطعم: العنوان والساعات والهاتف والأسئلة — حقولاً
          لا جُملاً، فتظهر النتيجة بطاقةً لا سطراً أزرق */}
      <SiteJsonLd lang="ar" />
      <StationSite lang="ar" />
    </>
  );
}
