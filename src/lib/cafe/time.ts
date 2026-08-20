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
