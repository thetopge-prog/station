import {
  Armchair,
  Bike,
  Boxes,
  CalendarClock,
  Calculator,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  HandCoins,
  HelpCircle,
  LayoutDashboard,
  MonitorPlay,
  PackageCheck,
  Percent,
  Printer,
  QrCode,
  Sparkles,
  UtensilsCrossed,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { canAccess, type StaffRole } from "./roles";

/**
 * الخريطة — ما يراه كل حساب، وأين يجده.
 *
 * كانت القائمة تعرض كل ما يسمح به الدور دفعةً واحدة: أربعة عشر زراً للكاشير
 * في شريط واحد يُسحب أفقياً على شاشة المحل. والكثرة ليست في عدد الصفحات — بل
 * في أن العشرين التي تُفتح مرة في الشهر تزاحم الثلاث التي تُفتح كل دقيقة.
 *
 * فصارت طبقتين: `primary` ما تلمسه يدك طول الوردية، و`group` رفٌّ مرتّب لكل
 * ما عداه. والخريطة هنا لا في المكوّن لأن المكوّن `"use client"` ويستورد
 * `next/navigation` — والبيانات وحدها تُختبر.
 */

export type NavGroup = "البيع" | "المطبخ" | "الحسابات" | "الإعدادات";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  /** null = كل موظف مسجَّل. [] = المدير وحده. وقائمة = المدير ومن فيها. */
  allow: StaffRole[] | null;
  group: NavGroup;
  icon: LucideIcon;
  /** يفتح في تبويب مستقل — لأنه يغادر النظام ولا طريق للعودة منه */
  external?: true;
};

export const NAV: NavItem[] = [
  { href: "/cashier", label: "الكاشير", short: "الكاشير", allow: ["cashier"], group: "البيع", icon: Calculator },
  { href: "/orders", label: "الطلبات الواردة", short: "الطلبات", allow: ["cashier", "expediter"], group: "البيع", icon: ClipboardList },
  { href: "/tables", label: "الطاولات", short: "الطاولات", allow: ["cashier", "cleaner"], group: "البيع", icon: Armchair },
  { href: "/loyalty", label: "الولاء", short: "الولاء", allow: ["cashier"], group: "البيع", icon: CreditCard },
  { href: "/offers", label: "العروض", short: "العروض", allow: ["cashier"], group: "البيع", icon: Percent },
  { href: "/debts", label: "سجل الديون", short: "الديون", allow: ["cashier"], group: "البيع", icon: HandCoins },

  { href: "/expediter", label: "التجهيز", short: "التجهيز", allow: ["expediter", "cashier"], group: "المطبخ", icon: PackageCheck },
  { href: "/kds", label: "المطبخ", short: "المطبخ", allow: ["chef", "expediter", "cashier"], group: "المطبخ", icon: ChefHat },
  // شاشة الزبائن: خارج مجموعة الموظفين، بلا ترويسة ولا رجوع — فتُفتح وحدها
  { href: "/queue", label: "شاشة الاستلام", short: "الاستلام", allow: ["expediter", "cashier"], group: "المطبخ", icon: MonitorPlay, external: true },
  { href: "/clean", label: "تنظيف الطاولات", short: "التنظيف", allow: ["cleaner", "cashier"], group: "المطبخ", icon: Sparkles },

  { href: "/daily", label: "جرد اليوم", short: "الجرد", allow: ["cashier"], group: "الحسابات", icon: ClipboardCheck },
  { href: "/expenses", label: "المصروفات", short: "المصروفات", allow: ["cashier"], group: "الحسابات", icon: Wallet },
  { href: "/inventory", label: "المخزون", short: "المخزون", allow: ["chef", "cashier", "expediter"], group: "الحسابات", icon: Boxes },
  { href: "/dashboard", label: "لوحة التحكم", short: "التحكم", allow: [], group: "الحسابات", icon: LayoutDashboard },

  { href: "/menu-admin", label: "المنيو", short: "المنيو", allow: [], group: "الإعدادات", icon: UtensilsCrossed },
  { href: "/employees", label: "الموظفون", short: "الموظفون", allow: [], group: "الإعدادات", icon: Users },
  { href: "/attendance", label: "الدخول والانصراف", short: "الحضور", allow: [], group: "الإعدادات", icon: CalendarClock },
  { href: "/partners", label: "شركات التوصيل", short: "الشركات", allow: [], group: "الإعدادات", icon: Bike },
  { href: "/printers", label: "الطابعات", short: "الطابعات", allow: [], group: "الإعدادات", icon: Printer },
  { href: "/qr", label: "رموز QR", short: "QR", allow: [], group: "الإعدادات", icon: QrCode },
  { href: "/setup", label: "التركيب", short: "التركيب", allow: [], group: "الإعدادات", icon: Wrench },
  { href: "/help", label: "التعليمات", short: "تعليمات", allow: null, group: "الإعدادات", icon: HelpCircle },
];

/**
 * الأزرار التي لا تختفي — ما يلمسه كل دور طوال الوردية، لا ما يُسمح له به.
 *
 * الكاشير يبيع، ويقبل الطلبات الواردة، ويتابع التجهيز. أما الجرد والمصروفات
 * والولاء فمرة في اليوم أو الأسبوع، ومكانها الرفّ.
 */
const PRIMARY: Record<StaffRole, string[]> = {
  cashier: ["/cashier", "/orders", "/expediter"],
  expediter: ["/expediter", "/orders", "/kds"],
  chef: ["/kds", "/inventory"],
  cleaner: ["/clean", "/tables"],
  admin: ["/dashboard", "/cashier", "/orders", "/daily"],
};

export function navFor(roles: StaffRole[] | StaffRole | null, isDeveloper = false) {
  const mine = roles === null ? [] : Array.isArray(roles) ? roles : [roles];
  const links = NAV.filter(
    (n) => (n.href !== "/setup" || isDeveloper) && (canAccess(mine, n.allow ?? []) || n.allow === null),
  );
  /*
   * أزرار من يحمل صلاحيتين: اتحاد قائمتيه بترتيب صلاحياته، بلا تكرار.
   *
   * وتُقصّ عند أربعة لأن الشريط السفلي يسع أربعة وزرّ «المزيد» — وكاشير+مجهّز
   * يعطيان خمسة. والترتيب هو ترتيب الصلاحيات، فأول صلاحية تفوز بالمقاعد
   * الأولى: من هو كاشير أولاً يرى الكاشير أولاً.
   */
  const wanted = [...new Set(mine.flatMap((r) => PRIMARY[r] ?? []))].slice(0, 4);
  // ترتيب PRIMARY هو ترتيب العرض، فيثبت مكان كل زر تحت الإصبع
  const primary = wanted.map((href) => links.find((l) => l.href === href)).filter((l) => l !== undefined);

  const groups = (["البيع", "المطبخ", "الحسابات", "الإعدادات"] as const)
    .map((title) => ({ title, items: links.filter((l) => l.group === title) }))
    .filter((g) => g.items.length > 0);

  return { links, primary, groups };
}
