import { NextResponse } from "next/server";

/**
 * ساعة الخادم — لحظةٌ واحدة، لا شيء غيرها.
 *
 * الطور يُحقن في صفحة الجدار وقتَ بنائها، فإن حُمّلت الصفحة من خزينٍ قديم أو
 * تأخّرت شبكتها بقيت تلك الشاشة متأخّرةً عن أخواتها إلى إعادة التحميل التالية
 * — عشر دقائق يقف فيها المشهد على شاشةٍ ويمضي على ثلاث.
 *
 * فتسأل كل شاشة هذا العنوان كل دقيقتين وتصحّح نفسها بلا إعادة تحميل. والجواب
 * رقمٌ واحد: لا قراءة من قاعدة، ولا جلسة، ولا شيء يُحسب.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { t: Date.now() },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
  );
}
