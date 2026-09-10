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

/**
 * حدّا الوردية بالدقائق من منتصف ليل بغداد. ما تجاوز ١٤٤٠ يعني اليوم التالي:
 * نهاية المسائية ١٦٢٠ = ٠٣:٠٠ فجراً. وهكذا يبقى end > start دائماً، فيصير
 * الحساب طرحاً واحداً لا شرطاً.
 */
export type ShiftWindows = Record<ShiftPeriod, [number, number]>;

/**
 * الدوام الحالي، وهو أيضاً ما يُبذَر في 0080.
 *
 * صار الجدول مصدر الحقيقة كي يعدّله المدير من الشاشة، لكن هذه النسخة تبقى:
 * تُستعمل حين يتعذّر بلوغ القاعدة — ومنعُ البيع لأن استعلاماً فشل أسوأ من
 * العمل بأوقات الأمس — وفي الاختبار، فتبقى الدوالّ صرفة.
 */
export const DEFAULT_WINDOWS: ShiftWindows = {
  morning: [9 * 60, 18 * 60],
  evening: [18 * 60, 27 * 60],
};

/** المهلة الافتراضية — ساعة قبل الوردية وساعة بعدها. */
export const GRACE_MINUTES = 60;

/** دقيقة من منتصف الليل ← «HH:MM»، ولو تجاوزت اليوم. */
const hhmm = (m: number) =>
  `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
export function inShift(
  period: ShiftPeriod | null | undefined,
  at: Date = new Date(),
  grace = GRACE_MINUTES,
  windows: ShiftWindows = DEFAULT_WINDOWS,
): boolean {
  if (!period) return true;
  const [start, end] = windows[period];
  const lo = start - grace;
  const hi = end + grace;
  const t = baghdadMinutes(at);
  // مرّتان: مرّة لهذا اليوم، ومرّة كامتداد لوردية أمس عبر منتصف الليل
  return (t >= lo && t <= hi) || (t + 1440 >= lo && t + 1440 <= hi);
}

/** الوردية التي تقع فيها هذه اللحظة — لوسم سطر الحضور. */
export function shiftAt(at: Date = new Date(), windows: ShiftWindows = DEFAULT_WINDOWS): ShiftPeriod | null {
  if (inShift("morning", at, 0, windows)) return "morning";
  if (inShift("evening", at, 0, windows)) return "evening";
  return null;
}

/** «٠٩:٠٠–١٨:٠٠» — نصّ واحد للرسالة وللقائمة، فلا يبقى وقتٌ مكتوب بيد أحد. */
export function shiftHours(period: ShiftPeriod, windows: ShiftWindows = DEFAULT_WINDOWS): string {
  const [s, e] = windows[period];
  return `${hhmm(s)}–${hhmm(e)}`;
}

/**
 * دقائق حتى نهاية الوردية — للتحذير قبل انتهائها.
 *
 * الالتفاف حول منتصف الليل للمسائية وحدها: الساعة ٠١:٠٠ تقع في وردية بدأت
 * أمس السادسة مساءً، فالمتبقّي ١٢٠ دقيقة لا سالب ألف.
 */
export function minutesToEnd(period: ShiftPeriod, at: Date = new Date(), windows: ShiftWindows = DEFAULT_WINDOWS): number {
  const [start, end] = windows[period];
  let t = baghdadMinutes(at);
  if (end > 1440 && t < start) t += 1440;
  return end - t;
}

/** نصّ يقوله للموظف الممنوع — «متى أعود؟» هو السؤال الوحيد الذي يهمّه. */
export function shiftDeniedMessage(period: ShiftPeriod, windows: ShiftWindows = DEFAULT_WINDOWS): string {
  const [start, end] = windows[period];
  // بالدقائق: كان يطبع :00 دائماً، فدوامٌ ينتهي ١٨:٣٠ يقول للموظف ١٨:٠٠
  return `دوامك ${SHIFT_AR[period]} من ${hhmm(start)} إلى ${hhmm(end)} — راجع الإدارة إن كنت مطلوباً خارجه.`;
}

/**
 * يوم الدوام — مُزاح أربع ساعات عن منتصف الليل.
 *
 * business_day يتقلّب عند منتصف الليل بالضبط، فوردية ٣ع–٣ف تقع في يومين
 * وتنقسم على تقريرين. ولن أغيّر business_day — يمسّ كل جدول في النظام. لكن
 * الحضور يحمل يومه الخاص، فتبقى الوردية سطراً واحداً.
 *
 * وأربع ساعات لأنها بعد نهاية أطول وردية (٠٣:٠٠) وقبل بداية أبكرها (٠٩:٠٠).
 * توأم SQL لها: public.work_day_of() في الترحيل 0062.
 */
export function workDay(at: Date = new Date()): string {
  return formatInTimeZone(new Date(at.getTime() - 4 * 60 * 60 * 1000), CAFE_TZ, "yyyy-MM-dd");
}
