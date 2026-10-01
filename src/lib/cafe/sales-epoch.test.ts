import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clampFrom, isBeforeEpoch } from "./sales-epoch";

/**
 * بداية المبيعات — ما يجب ألّا ينكسر.
 *
 * قراءة التاريخ نفسه تحتاج قاعدة فلا تُختبر هنا. أما ما يُختبر فهو الحساب
 * النقيّ، **والحارس**: أن يبقى مسار التوقّع خارج القصّ. ذاك الانكسار لا يرفع
 * خطأً ولا يُرى في شاشة — تهبط أرقام الخطة وحدها ولا يعرف أحد لماذا.
 */

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("قصّ المدى عند البداية", () => {
  const E = "2026-10-01";

  it("مدى يسبق البداية يُرفع إليها", () => {
    expect(clampFrom("2026-09-01", E)).toBe(E);
  });

  it("ومدى بعدها يبقى كما هو", () => {
    expect(clampFrom("2026-10-05", E)).toBe("2026-10-05");
  });

  it("ويوم البداية نفسه معروض — لا مقصوص", () => {
    expect(clampFrom(E, E)).toBe(E);
    expect(isBeforeEpoch(E, E)).toBe(false);
  });

  it("وما قبلها محجوب", () => {
    expect(isBeforeEpoch("2026-09-30", E)).toBe(true);
  });
});

describe("التوقّع يقرأ التاريخ كاملاً", () => {
  const bot = read("../../../supabase/functions/telegram-bot/index.ts");

  /*
   * الخطأ الذي يُسقط الخطط بصمت.
   *
   * `summary()` مقصوصة عند البداية، وهي لشاشات المال وحدها. و`prepPlanText`
   * و`planResultText` تنادِيان `range_summary` مباشرةً عمداً. ومن «يوحّد»
   * النداءين لاحقاً يجعل الخطة تقرأ أصفاراً أول ما تُضبط بداية جديدة.
   */
  it("خطة التجهيز لا تمرّ من summary المقصوصة", () => {
    const fn = bot.slice(bot.indexOf("async function prepPlanText"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain('rpc("range_summary"');
    expect(body).not.toContain("summary(");
  });

  it("ونتائج الخطة كذلك", () => {
    const fn = bot.slice(bot.indexOf("async function planResultText"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain('rpc("range_summary"');
    expect(body).not.toContain("summary(");
  });

  /** والقصّ لم ينزل إلى القاعدة — وإلّا لما نفع أن يُنادى rpc مباشرةً.
   *  (ذِكرها في تعليقٍ مقصود؛ المحظور إعادة تعريفها) */
  it("ولا يُعاد تعريف range_summary في الترحيل", () => {
    const mig = read("../../../supabase/migrations/0116_sales_epoch.sql");
    expect(mig).not.toMatch(/function\s+public\.range_summary/);
  });
});

describe("حسابات الناس لا تُصفَّر", () => {
  /*
   * الديون وحسابات شركات التوصيل أموالٌ لنا عند الناس، لا مبيعاتٌ تُعرض.
   * تصفيرها في الشاشة يعني نسيان من يدين لنا — وهو خطأ لا يُكتشف إلّا بخسارة.
   */
  const mig = read("../../../supabase/migrations/0116_sales_epoch.sql");

  it("الترحيل لا يمسّ أرصدة المدينين ولا الشركات", () => {
    expect(mig).not.toContain("debtor_balances");
    expect(mig).not.toContain("partner_balances");
  });
});

describe("ما يراه الكاشير", () => {
  /*
   * سجلّ الكاشير على يومه وحده (طلب الإدارة). والحارس هنا لأن الشرط سطرٌ
   * واحد يسهل أن يُزال وهو يُصلح «عطلاً» ظاهره أن اليوم القديم لا يفتح.
   */
  it("سجلّ الطلبات يرفض يوماً غير اليوم لغير الإدارة", () => {
    const src = read("./history-actions.ts");
    expect(src).toContain("!staff.isAdmin && day !== businessDay()");
  });
});
