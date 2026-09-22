import type { Metadata } from "next";
import { StationSite } from "@/components/site/StationSite";
import { siteMetadata } from "@/lib/site/meta";

/** الصفحة التعريفية بلغتها — مسار حقيقي لا مطابقة شاملة (تلك كانت تبتلع /apk) */
export const metadata: Metadata = siteMetadata("ku");

export default function Page() {
  return <StationSite lang="ku" />;
}
