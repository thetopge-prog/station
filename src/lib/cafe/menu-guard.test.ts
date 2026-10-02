import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * صنفٌ بلا سعر لا يُعرض على الزبون — حارس القاعدة التي طلبها المالك.
 *
 * القصّة: «بيتزا فري فيجي - وسط» أُنشئت بسعر صفر فظهرت على المنيو مكتوباً
 * تحتها «مجاناً»، وبيعت مرّتين بصفر قبل أن تُلحَظ.
 *
 * والخطر أن يُعاد تعريف `menu_public` في ترحيلٍ لاحق — كما أُعيد أربع مرّات
 * قبل اليوم — فيسقط الشرط بلا أن ينكسر شيء ظاهر. فالاختبار يفحص **آخر**
 * تعريفٍ للعرض في مجلّد الترحيلات، لا ترحيلاً بعينه.
 */

const DIR = new URL("../../../supabase/migrations/", import.meta.url);

/** آخر ترحيلٍ يُعرّف هذا العرض — الأعلى رقماً هو السارِي */
function lastDefining(view: string): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found = "";
  for (const f of files) {
    const sql = readFileSync(new URL(f, DIR), "utf8");
    if (new RegExp(`create (or replace )?view public\\.${view}\\b`).test(sql)) found = sql;
  }
  return found;
}

describe("المنيو العامّ لا يعرض صنفاً بلا سعر", () => {
  it("‏menu_public يحمل الحارس", () => {
    const sql = lastDefining("menu_public");
    expect(sql).toContain("item_is_priced");
  });

  it("ومنيو الطلاب كذلك", () => {
    const sql = lastDefining("student_menu_public");
    expect(sql).toContain("item_is_priced");
  });

  /*
   * والحارس يقبل صنفاً كلّ سعره في خياراته («وسط/كبير»). وبلا هذا الشرط
   * يختفي صنفٌ صحيح من المنيو بصمت — وهو عطلٌ آخر بنفس السوء.
   */
  it("ويقبل صنفاً سعره في خياراته وحدها", () => {
    const sql = lastDefining("menu_public");
    const fn = readFileSync(new URL("0118_no_unpriced_on_menu.sql", DIR), "utf8");
    expect(sql).toContain("item_is_priced");
    expect(fn).toContain("item_variants");
    expect(fn).toContain("price_override");
  });
});
