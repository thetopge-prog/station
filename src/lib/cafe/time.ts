import { formatInTimeZone } from "date-fns-tz";

/** The cafe operates on Baghdad calendar days — used everywhere "today" appears. */
export const CAFE_TZ = "Asia/Baghdad";

/** Business day (yyyy-MM-dd) for an instant, in Baghdad time. */
/**
 * يوم العمل من 9 صباحاً إلى 3 فجراً: الحدّ 04:00 بغداد لا منتصف الليل، فطلب
 * الواحدة فجراً يُحسب في يوم الوردية التي باعته. توأم public.business_day_of()
 * في الترحيل 0089 — يُغيَّران معاً أو لا يُغيَّران.
 */
export const DAY_CUT_HOURS = 4;

/** «تم التجهيز» يبقى على الشاشة هذه الدقائق ثم يُرفع — والكاشير يُنبَّه قبلها بدقيقة (0090) */
export const READY_EXPIRE_MIN = 5;

/**
 * قسم من المطبخ (برجر/زنجر…) يغلق **02:30** فجراً ويعود 09:00 — دقائق من
 * منتصف ليل بغداد. من 01:30 عدّاد تنازلي، ومن 02:00 تنبيه «سيتم التواصل معك
 * إن أغلق»، ومن 02:30 لا يُطلب.
 *
 * وكان يغلق 02:00، فمُدّ بعد قياس شكل الليلة: أزحم ساعةٍ في السبت هي **الواحدة
 * فجراً** (٤٤ قطعة، ضعف العاشرة مساءً)، والساعات الثلاث بعد منتصف الليل تحمل
 * ثلث اليوم — فكان نصف المنيو يُغلق بعد ساعةٍ من الذروة.
 *
 * توأمان يتغيّران معه أو لا يتغيّر: `isLateCutoffNow` في order-flow.ts،
 * وفحص place_order في الترحيل 0106 (وهو بالدقائق لا بالساعة، وإلّا لما عرف
 * النصف).
 */
export const LATE_CUTOFF = { countdownFrom: 90, noticeFrom: 120, closeAt: 150, reopenAt: 540 } as const;

/**
 * ساعة إغلاق القسم كما تُعرَض («02:30») — تُشتقّ من `LATE_CUTOFF` لا تُكتب.
 *
 * كانت «02:00» مكتوبةً بيد في أربعة نصوص، فتأخيرُ الإغلاق نصف ساعة يترك
 * أربع رسائل تَعِد الزبون بوقتٍ مضى.
 */
export const lateCloseLabel = (): string =>
  `${String(Math.floor(LATE_CUTOFF.closeAt / 60)).padStart(2, "0")}:${String(LATE_CUTOFF.closeAt % 60).padStart(2, "0")}`;

export type LateCutoffState = { phase: "open" | "countdown" | "notice" | "closed"; minutesLeft: number };

export function lateCutoffState(now: Date = new Date(), tz: string = CAFE_TZ): LateCutoffState {
  const [h, m] = formatInTimeZone(now, tz, "HH:mm").split(":").map(Number);
  const min = h * 60 + m;
  const left = LATE_CUTOFF.closeAt - min;
  if (min >= LATE_CUTOFF.closeAt && min < LATE_CUTOFF.reopenAt) return { phase: "closed", minutesLeft: 0 };
  if (min >= LATE_CUTOFF.noticeFrom && min < LATE_CUTOFF.closeAt) return { phase: "notice", minutesLeft: left };
  if (min >= LATE_CUTOFF.countdownFrom && min < LATE_CUTOFF.closeAt) return { phase: "countdown", minutesLeft: left };
  return { phase: "open", minutesLeft: 0 };
}

export function businessDay(date: Date = new Date(), tz: string = CAFE_TZ): string {
  return formatInTimeZone(new Date(date.getTime() - DAY_CUT_HOURS * 3_600_000), tz, "yyyy-MM-dd");
}

/** N-day range ending today (inclusive), as [fromDay, toDay] Baghdad dates. */
export function lastNDays(n: number, now: Date = new Date(), tz: string = CAFE_TZ): [string, string] {
  const to = businessDay(now, tz);
  const from = businessDay(new Date(now.getTime() - (n - 1) * 24 * 60 * 60 * 1000), tz);
  return [from, to];
}

/**
 * «منذ متى» بوحدة يقرؤها إنسان.
 *
 * كانت الشاشات تطبع الدقائق خاماً، فبلغ شريط الوردية «٢١١٧ د» — عدّاد دقائق
 * مستمر لا يقول شيئاً. لا أحد يقسم على ستّين وهو واقف عند الكاونتر.
 *
 * دقائق، ثم ساعات، ثم أيام — وتُذكر الدقائق مع الساعات في الساعات الأولى وحدها،
 * حيث تكون ما زالت تعني شيئاً.
 */
export function sinceLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m < 1) return "الآن";
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rest = m % 60;
    return rest > 0 && h < 6 ? `${h} س ${rest} د` : `${h} س`;
  }
  const d = Math.floor(h / 24);
  return d === 1 ? "يوم" : `${d} يوم`;
}
