import type { Metadata } from "next";
import { StationSite } from "@/components/site/StationSite";
import { siteMetadata } from "@/lib/site/meta";
import { SiteJsonLd } from "@/components/site/SiteJsonLd";

/** الصفحة التعريفية بلغتها — مسار حقيقي لا مطابقة شاملة (تلك كانت تبتلع /apk) */
export const metadata: Metadata = siteMetadata("ku");

export default function Page() {
  return (
    <>
      {/* ما يقرؤه جوجل عن المطعم: العنوان والساعات والهاتف والأسئلة — حقولاً
          لا جُملاً، فتظهر النتيجة بطاقةً لا سطراً أزرق */}
      <SiteJsonLd lang="ku" />
      <StationSite lang="ku" />
    </>
  );
}
