import type { Metadata } from "next";
import { StudentJoinClient } from "@/components/cafe/StudentJoinClient";

/**
 * تسجيل الطالب — صفحة عامّة.
 *
 * تقبل `?ref=` من رابط دعوة زميله، فتُنسب الدعوة إليه وتُمنح نقاطه حين يُقبل
 * هذا الطالب (لا حين يسجّل — وإلّا صارت الدعوة مزرعة أسماء).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "منيو الطلاب — ستيشن",
  description: "سجّل بهويتك الجامعية واحصل على أسعار الطلاب في مطعم المحطة.",
  robots: { index: false, follow: false },
};

export default async function StudentJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" && sp.ref.trim() ? sp.ref.trim() : null;
  return <StudentJoinClient refCode={ref} />;
}
