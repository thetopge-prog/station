import type { Metadata } from "next";
import { StationSite } from "@/components/site/StationSite";
import { siteMetadata } from "@/lib/site/meta";

/** الصفحة الرئيسية = الصفحة التعريفية بالعربية. اللغات الأخرى على /en /tr /it /ku */
export const metadata: Metadata = siteMetadata("ar");

export default function Home() {
  return <StationSite lang="ar" />;
}
