import { describe, expect, it } from "vitest";
import { isTypingTarget, sheetRows, shortcutFor, SHORTCUTS, type KeyContext } from "./shortcuts";
import type { StaffRole } from "./roles";

/**
 * اختصارٌ يعمل في غير موضعه أسوأ من غيابه: ضغطةٌ خاطئة تُجهّز طلبات لم تُجهَّز،
 * أو تُفرغ سلّةً نصفَ مكتوبة أمام زبون. فالاختبار على الحواجز لا على النجاح.
 */
const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
  pathname: "/cashier",
  roles: ["cashier"] as StaffRole[],
  locked: false,
  typing: false,
  ...over,
});

describe("shortcutFor", () => {
  it("يتجاهل ما ليس في الجدول", () => {
    for (const k of ["a", "1", "Enter", "F1", "F5", "F12", ""]) {
      expect(shortcutFor(k, ctx()), k).toBeNull();
    }
  });

  it("مفاتيح الكاشير تعمل على شاشة الكاشير", () => {
    expect(shortcutFor("F2", ctx())).toEqual({ kind: "screen", name: "search" });
    expect(shortcutFor("F8", ctx())).toEqual({ kind: "screen", name: "newOrder" });
    expect(shortcutFor("F9", ctx())).toEqual({ kind: "screen", name: "payCash" });
    expect(shortcutFor("F10", ctx())).toEqual({ kind: "screen", name: "reprint" });
  });

  it("ولا تعمل خارجها — F9 على شاشة المخزون لا تدفع شيئاً", () => {
    for (const k of ["F2", "F8", "F9", "F10"]) {
      expect(shortcutFor(k, ctx({ pathname: "/inventory" })), k).toBeNull();
    }
  });

  it("«تجهيز الكل» لشاشة التجهيز وحدها", () => {
    expect(shortcutFor("F6", ctx({ pathname: "/expediter" }))).toEqual({ kind: "screen", name: "readyAll" });
    expect(shortcutFor("F6", ctx({ pathname: "/cashier" }))).toBeNull();
  });

  it("المصروف والطلبات الواردة من أي شاشة", () => {
    for (const path of ["/cashier", "/expediter", "/inventory", "/history"]) {
      expect(shortcutFor("F4", ctx({ pathname: path })), path).toEqual({ kind: "expense" });
      expect(shortcutFor("F7", ctx({ pathname: path })), path).toEqual({ kind: "go", href: "/orders" });
    }
  });

  it("الدرج المقفل يُسكت كل شيء — حتى الإغلاق", () => {
    for (const k of Object.keys(SHORTCUTS)) {
      expect(shortcutFor(k, ctx({ locked: true, pathname: "/expediter" })), k).toBeNull();
    }
  });

  it("الكتابة تُسكت كل شيء إلا Escape", () => {
    expect(shortcutFor("F8", ctx({ typing: true }))).toBeNull();
    expect(shortcutFor("F4", ctx({ typing: true }))).toBeNull();
    expect(shortcutFor("Escape", ctx({ typing: true }))).toEqual({ kind: "close" });
  });

  it("الدور يحكم: المنظّف لا يجهّز ولا يدفع ولا يسجّل مصروفاً", () => {
    const cleaner = ctx({ roles: ["cleaner"], pathname: "/expediter" });
    expect(shortcutFor("F6", cleaner)).toBeNull();
    expect(shortcutFor("F4", cleaner)).toBeNull();
    expect(shortcutFor("F9", ctx({ roles: ["cleaner"] }))).toBeNull();
  });

  it("الطبّاخ لا يملك مفاتيح الكاشير", () => {
    expect(shortcutFor("F9", ctx({ roles: ["chef"] }))).toBeNull();
    expect(shortcutFor("F4", ctx({ roles: ["chef"] }))).toBeNull();
  });

  it("المدير يمرّ من كل بوّابة — كما في بقية النظام", () => {
    const admin = ctx({ roles: ["admin"] });
    expect(shortcutFor("F9", admin)).not.toBeNull();
    expect(shortcutFor("F6", ctx({ roles: ["admin"], pathname: "/expediter" }))).not.toBeNull();
  });

  it("Escape لكل موظّف مهما كان دوره", () => {
    for (const r of ["cashier", "expediter", "chef", "cleaner"] as StaffRole[]) {
      expect(shortcutFor("Escape", ctx({ roles: [r] })), r).toEqual({ kind: "close" });
    }
  });
});

describe("جدول الاختصارات", () => {
  it("لا يستعمل مفتاحاً يحجزه المتصفّح", () => {
    for (const k of ["F1", "F3", "F5", "F11", "F12"]) expect(SHORTCUTS[k]).toBeUndefined();
  });

  it("لا يستعمل حرفاً ولا رقماً — القارئ يكتبها داخل رمز التذكرة", () => {
    for (const k of Object.keys(SHORTCUTS)) {
      expect(/^(F\d+|Escape)$/.test(k), k).toBe(true);
    }
  });

  it("الورقة تُولَّد من الجدول فلا تفترق عنه", () => {
    const rows = sheetRows();
    expect(rows).toHaveLength(Object.keys(SHORTCUTS).length);
    for (const r of rows) expect(r.label.trim()).not.toBe("");
  });
});

describe("isTypingTarget", () => {
  it("يمسك خانات الكتابة كلّها", () => {
    expect(isTypingTarget("INPUT", false)).toBe(true);
    expect(isTypingTarget("TEXTAREA", false)).toBe(true);
    expect(isTypingTarget("SELECT", false)).toBe(true);
    expect(isTypingTarget("DIV", true)).toBe(true);
  });

  it("ويترك ما عداها", () => {
    expect(isTypingTarget("DIV", false)).toBe(false);
    expect(isTypingTarget("BUTTON", false)).toBe(false);
    expect(isTypingTarget(null, false)).toBe(false);
  });
});
