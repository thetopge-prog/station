import { canAccess, type StaffRole } from "./roles";

/**
 * اختصارات لوحة المفاتيح للكاونتر.
 *
 * القياس: ٩٩ طلب كاشير في اليوم، وذروتها بين منتصف الليل والواحدة. الموظّف
 * في تلك الساعة يده على لوحة المفاتيح لا على الفأرة، وكل نقرة يوفّرها
 * الاختصار تُضرب في مئة.
 *
 * **مفاتيح F حصراً، وليس هذا ذوقاً.** القارئ الضوئي لوحةُ مفاتيح: يكتب حروف
 * التذكرة بسرعة ثم Enter، و`use-barcode-scanner` يلتقطها من `window`. وأي
 * اختصار بحرف أو رقم كان سيُدسّ داخل رمز التذكرة فيفسده. أما مفاتيح F
 * فـ`charFromKey` يُرجع لها `""` فلا تلوّث المخزن. وتُستثنى F1 وF3 وF5 وF11
 * وF12 لأن المتصفّح يحجزها ولا يُسلّمها للصفحة.
 *
 * والقرار هنا دالّةٌ صافية لا داخل المكوّن: المكوّن `"use client"` ولا يُختبر
 * في هذا المشروع (لا jsdom ولا RTL)، والقاعدة — أيّ مفتاح، لأي دور، على أي
 * شاشة — هي ما يجب أن يُمسَك باختبار. نفس سبب وجود `nav.ts`.
 */

export type ShortcutAction =
  /** يُنفَّذ من أي شاشة */
  | { kind: "go"; href: string }
  | { kind: "expense" }
  | { kind: "close" }
  /** تُنفَّذ في شاشتها وحدها — الشاشة تملك بياناتها */
  | { kind: "screen"; name: ScreenCommand };

export type ScreenCommand = "search" | "readyAll" | "newOrder" | "payCash" | "reprint";

type Rule = {
  action: ShortcutAction;
  /** الأدوار التي تملك هذا العمل. `null` = كل موظّف */
  allow: StaffRole[] | null;
  /** المسار الذي يعمل فيه، أو `null` لكل المسارات */
  path: string | null;
  /** ما يُكتب في ورقة الموظّف */
  label: string;
};

/**
 * الجدول. مصدرٌ واحد للاختصارات وللورقة التي تُسلَّم للموظّف — فلا تفترق
 * الورقة عن النظام بعد تعديلٍ يُنسى.
 */
export const SHORTCUTS: Record<string, Rule> = {
  F2: { action: { kind: "screen", name: "search" }, allow: ["cashier"], path: "/cashier", label: "البحث عن صنف" },
  F4: { action: { kind: "expense" }, allow: ["cashier"], path: null, label: "تسجيل مصروف" },
  F6: { action: { kind: "screen", name: "readyAll" }, allow: ["expediter", "cashier"], path: "/expediter", label: "تجهيز كل الطلبات" },
  F7: { action: { kind: "go", href: "/orders" }, allow: ["cashier", "expediter"], path: null, label: "الطلبات الواردة" },
  F8: { action: { kind: "screen", name: "newOrder" }, allow: ["cashier"], path: "/cashier", label: "طلب جديد" },
  F9: { action: { kind: "screen", name: "payCash" }, allow: ["cashier"], path: "/cashier", label: "دفع نقدي وإصدار" },
  F10: { action: { kind: "screen", name: "reprint" }, allow: ["cashier"], path: "/cashier", label: "إعادة طباعة آخر إيصال" },
  Escape: { action: { kind: "close" }, allow: null, path: null, label: "إغلاق المفتوح" },
};

export type KeyContext = {
  pathname: string;
  roles: StaffRole[];
  /** الدرج مقفل — لا شيء يعمل حتى يفتحه صاحبه */
  locked: boolean;
  /** المؤشّر داخل خانة كتابة */
  typing: boolean;
};

/**
 * ما الذي يفعله هذا المفتاح الآن — أو لا شيء.
 *
 * ثلاثة حواجز، وكلّها مقصودة:
 *   · الكتابة: نفس حارس القارئ — من يكتب اسم زبون لا يريد أن يقفز إلى شاشة.
 *     وEsc وحده يمرّ، فهو «ألغِ ما أنا فيه» لا أمرَ عمل.
 *   · القفل: الدرج مقفل يعني أن صاحبه ليس هنا.
 *   · الدور: المنظّف لا «يجهّز كل الطلبات» بضغطة.
 */
export function shortcutFor(key: string, ctx: KeyContext): ShortcutAction | null {
  const rule = SHORTCUTS[key];
  if (!rule) return null;
  if (ctx.locked) return null;
  if (ctx.typing && rule.action.kind !== "close") return null;
  if (rule.path && !ctx.pathname.startsWith(rule.path)) return null;
  if (rule.allow && !canAccess(ctx.roles, rule.allow)) return null;
  return rule.action;
}

/** هل المؤشّر في خانة كتابة؟ نفس شرط `use-barcode-scanner` حرفياً */
export function isTypingTarget(tag: string | null | undefined, editable: boolean): boolean {
  return editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** صفوف ورقة الموظّف — تُولَّد من الجدول نفسه لا تُكتب بيد */
export const sheetRows = (): { key: string; label: string }[] =>
  Object.entries(SHORTCUTS).map(([key, r]) => ({ key, label: r.label }));
