import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * «بداية المبيعات» — من أي يوم تُحسب الأرقام المعروضة.
 *
 * الطلبات القديمة كلّها باقية في مكانها؛ هذا قصٌّ على العرض وحده. والسبب في
 * 0116: التوقّعات تقرأ التاريخ كاملاً، فالقصّ لو نزل إلى القاعدة لأسقطها.
 *
 * ⚠ ولا تُستعمل في مسار التوقّع إطلاقاً — `prep-forecast-actions.ts` و
 * `kitchen-watch-actions.ts` يقرآن المدى كاملاً عمداً، ويحرس ذلك اختبارٌ في
 * `sales-epoch.test.ts`.
 */

/** الأبعد في الزمن بين تاريخين — الحدّ الذي لا يُعرض ما قبله */
export function clampFrom(from: string, epoch: string): string {
  return from > epoch ? from : epoch;
}

/** قبل البداية = لا يُعرض */
export function isBeforeEpoch(day: string, epoch: string): boolean {
  return day < epoch;
}

// ذاكرة قصيرة: التاريخ يتغيّر مرّةً في العمر، ولوحة التحكم تنادي أحد عشر
// مجمِّعاً في طلبٍ واحد. دقيقة تكفي لتبقى لحظةُ «نفّذ الآن» محسوسةً فوراً.
const TTL_MS = 60_000;
let cache: { day: string; at: number } | null = null;

export async function getSalesEpoch(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.day;
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc("sales_epoch");
  // تعذّرت القراءة: يُعرض كل شيء. الأرقام الزائدة تُرى وتُصحَّح، والأرقام
  // الناقصة تُصدَّق — فالخطأ الآمن هنا هو ألّا نقصّ.
  const day = error || !data ? "1900-01-01" : String(data);
  cache = { day, at: Date.now() };
  return day;
}
