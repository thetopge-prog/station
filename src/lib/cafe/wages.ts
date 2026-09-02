/** Wage period vocabulary — shared by server actions and client UI. */
export type WagePeriod = "daily" | "weekly" | "monthly";

export const WAGE_PERIOD_AR: Record<WagePeriod, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};

/**
 * فئة سلفة الموظف في جدول المصاريف.
 *
 * تسكن هنا لا في daily-count: ذاك ملف "use server" ولا يُصدَّر منه إلا دوال
 * غير متزامنة. ومكانها الصحيح مع الرواتب على أي حال — السلفة سحبٌ على الراتب،
 * وثبات هذا الحرف هو ما يجعل «حساب موظف» رقماً يُجمع لا تخميناً.
 */
export const STAFF_ADVANCE = "سلفة موظف";
