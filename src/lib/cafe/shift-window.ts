import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { cachedRef, clearRef } from "./ttl-cache";
import { DEFAULT_WINDOWS, GRACE_MINUTES, type ShiftWindows } from "./work-shift";

/**
 * أوقات الورديتين من القاعدة، بذاكرة قصيرة.
 *
 * guardShift يعمل مع كل requireStaff، فقراءة الجدول في كل طلب ضريبة دائمة.
 * دقيقة واحدة كذاكرة الجلسة في auth.ts: تعديل المدير يسري على كل جهاز خلال
 * دقيقة، والصفحة التي حفظته ترى الجديد فوراً لأن الحفظ يُسقط الذاكرة.
 */
const TTL_MS = 60_000;

export async function getShiftWindows(): Promise<ShiftWindows> {
  return cachedRef("shift_windows", TTL_MS, async () => {
    try {
      const svc = createSupabaseServiceClient();
      const { data } = await svc.from("shift_windows").select("period, start_min, end_min");
      if (!data?.length) return DEFAULT_WINDOWS;
      const w: ShiftWindows = { ...DEFAULT_WINDOWS };
      for (const r of data) w[r.period] = [r.start_min, r.end_min];
      return w;
    } catch {
      // الرجوع إلى الافتراضي لا المنع: استعلام فاشل يجب ألّا يقفل المحل
      return DEFAULT_WINDOWS;
    }
  });
}

/**
 * فحصان قبل الحفظ، كلاهما يمنع إقفالاً ذاتياً لا يزيّن نموذجاً:
 *
 * · ساعة لا يُسمح فيها لأحد هي ساعة لا يبيع فيها المحل. تُرفض فجوة بين نهاية
 *   الصباحية وبداية المسائية تتجاوز المهلة، وكذلك الفجوة الليلية.
 * · إزاحة يوم الدوام أربع ساعات (0062) صحيحة فقط ما دامت لا وردية تبدأ قبل
 *   ٠٤:٠٠ ولا تنتهي بعدها. الخروج عن ذلك يشطر الوردية على تقريرين.
 */
export function validateWindows(w: ShiftWindows): string | null {
  const [ms, me] = w.morning;
  const [es, ee] = w.evening;
  if (me <= ms || ee <= es) return "نهاية الوردية يجب أن تكون بعد بدايتها.";
  if (ms < 240) return "لا تبدأ وردية قبل الرابعة فجراً — يوم الدوام يُحسب من هناك.";
  if (ee > 1440 + 240) return "لا تنتهي وردية بعد الرابعة فجراً — يوم الدوام يُحسب من هناك.";
  if (es > me + GRACE_MINUTES) return "بين الورديتين ساعات لا يُسمح فيها لأحد بالعمل.";
  if (ms + 1440 > ee + GRACE_MINUTES) return "بين نهاية المسائية وبداية الصباحية ساعات لا يُسمح فيها لأحد بالعمل.";
  return null;
}

export async function saveShiftWindows(next: ShiftWindows): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = validateWindows(next);
  if (bad) return { ok: false, error: bad };
  const svc = createSupabaseServiceClient();
  for (const period of ["morning", "evening"] as const) {
    const { error } = await svc.rpc("save_shift_window", {
      p_period: period,
      p_start: next[period][0],
      p_end: next[period][1],
    });
    if (error) return { ok: false, error: error.message };
  }
  // وإلا انتظر المدير دقيقة أمام رقم قديم كتبه بنفسه
  clearRef();
  return { ok: true };
}
