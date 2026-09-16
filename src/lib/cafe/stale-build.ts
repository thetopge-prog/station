"use client";

/**
 * صفحة بقيت مفتوحة عبر نشرٍ جديد.
 *
 * كل نشر يغيّر معرّفات إجراءات الخادم، فشاشة التجهيز المفتوحة منذ الصباح
 * تقول بعد الظهر «Server Action … was not found» على كل نقرة — بالإنجليزية
 * وبالأحمر، والمجهّز لا يعرف أن الحلّ هو F5. هنا يُعرَف الخطأ ويُعاد التحميل
 * مرّة واحدة؛ الجلسة في الكوكي فلا شيء يضيع.
 */
const STALE = /server action .* was not found|failed-to-find-server-action/i;
let reloading = false;

export function isStaleBuild(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return STALE.test(msg);
}

/** true = كانت الصفحة قديمة وبدأ التحميل؛ false = خطأ آخر يعالجه المستدعي */
export function reloadIfStale(err: unknown): boolean {
  if (!isStaleBuild(err) || reloading) return false;
  reloading = true;
  window.location.reload();
  return true;
}

/** يُعلَّق مرّة في هيكل الموظفين — لما لا يلتقطه أحد */
export function watchStaleBuild(): () => void {
  const onRejection = (e: PromiseRejectionEvent) => void reloadIfStale(e.reason);
  const onError = (e: ErrorEvent) => void reloadIfStale(e.error ?? e.message);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onError);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError);
  };
}
