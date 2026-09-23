import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPairId } from "@/lib/cafe/pair";
import { PhoneScanner } from "@/components/cafe/PhoneScanner";

/**
 * صفحة هاتف الموظّف حين يموت القارئ.
 *
 * عامّة بلا تسجيل دخول عمداً: وقتُ العطل هو أسوأ وقتٍ لمطالبة موظّفٍ بكلمة
 * مرور والطلبات واقفة. وهي لا تملك صلاحية شيء — تبثّ ما تقرؤه الكاميرا إلى
 * الشاشة، والشاشةُ وحدها تؤكّد بجلستها.
 */
export const dynamic = "force-dynamic";

// لا يُفهرَس ولا يُشارَك: رابطٌ عمره عمرُ لوحة الاقتران المفتوحة
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ScanPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  // المعرّف يأتي من المسار — يُفحص شكله قبل أن يصير اسم قناة
  if (!isPairId(pair)) notFound();
  return <PhoneScanner pairId={pair} />;
}
