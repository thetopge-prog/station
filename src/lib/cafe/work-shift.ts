import { formatInTimeZone } from "date-fns-tz";
import { CAFE_TZ } from "./time";

/**
 * ورديتا المطعم، والمنع خارجهما.
 *
 * ٩ص–٣ع و٣ع–٣ف. والثانية تعبر منتصف الليل، وهذا كل ما في الأمر من صعوبة:
 * الساعة ٠٢:٠٠ تقع **داخل** وردية بدأت أمس الثالثة عصراً.
 *
 * والمنع خطر بطبيعته — كاشير صباحي عند ٣:٠١ والمسائي لم يصل بعد يعني محلاً
 * لا يبيع. فمهلة ساعة على الطرفين، والمدير لا يُمنع، والوردية الفارغة لا
 * تُمنع، ولصاحب المحل استثناء ليوم بعينه. أربعة مخارج، لأن الخطأ هنا يُوقف
 * البيع لا يُزعج مستخدماً.
 */

export type ShiftPeriod = "morning" | "evening";

export const SHIFT_AR: Record<ShiftPeriod, string> = {
  morning: "صباحي",
  evening: "مسائي",
};

/** بالدقائق من منتصف ليل بغداد. نهاية المسائية ١٦٢٠ = ٠٣:٠٠ من الغد. */
const WINDOW: Record<ShiftPeriod, [number, number]> = {
  morning: [9 * 60, 15 * 60],
  evening: [15 * 60, 27 * 60],
};

/** المهلة الافتراضية — ساعة قبل الوردية وساعة بعدها. */
export const GRACE_MINUTES = 60;

function baghdadMinutes(at: Date): number {
  const [h, m] = formatInTimeZone(at, CAFE_TZ, "HH:mm").split(":").map(Number);
  return h * 60 + m;
}

/**
 * هل هذا الموظف داخل وقته الآن؟
 *
 * الفارغ يعني «بلا قيد» ويمرّ دائماً — وهو ما يُبقي الحسابات المشتركة
 * (كاشير · مجهّز · إدارة) تعمل في أي ساعة دون أن نلمسها.
 */
export function inShift(period: ShiftPeriod | null | undefined, at: Date = new Date(), grace = GRACE_MINUTES): boolean {
  if (!period) return true;
  const [start, end] = WINDOW[period];
  const lo = start - grace;
  const hi = end + grace;
  const t = baghdadMinutes(at);
  // مرّتان: مرّة لهذا اليوم، ومرّة كامتداد لوردية أمس عبر منتصف الليل
  return (t >= lo && t <= hi) || (t + 1440 >= lo && t + 1440 <= hi);
}

/** الوردية التي تقع فيها هذه اللحظة — لوسم سطر الحضور. */
export function shiftAt(at: Date = new Date()): ShiftPeriod | null {
  if (inShift("morning", at, 0)) return "morning";
  if (inShift("evening", at, 0)) return "evening";
  return null;
}

/** نصّ يقوله للموظف الممنوع — «متى أعود؟» هو السؤال الوحيد الذي يهمّه. */
export function shiftDeniedMessage(period: ShiftPeriod): string {
  const [start, end] = WINDOW[period];
  const hh = (m: number) => String(Math.floor((m % 1440) / 60)).padStart(2, "0");
  return `دوامك ${SHIFT_AR[period]} من ${hh(start)}:00 إلى ${hh(end)}:00 — راجع الإدارة إن كنت مطلوباً خارجه.`;
}
