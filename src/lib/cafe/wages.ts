/** Wage period vocabulary — shared by server actions and client UI. */
export type WagePeriod = "daily" | "weekly" | "monthly";

export const WAGE_PERIOD_AR: Record<WagePeriod, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};
