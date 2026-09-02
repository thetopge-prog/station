import { formatInTimeZone } from "date-fns-tz";

/** The cafe operates on Baghdad calendar days — used everywhere "today" appears. */
export const CAFE_TZ = "Asia/Baghdad";

/** Business day (yyyy-MM-dd) for an instant, in Baghdad time. */
export function businessDay(date: Date = new Date(), tz: string = CAFE_TZ): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
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
