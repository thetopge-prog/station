import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * عرض اليوم يُطبَّق على السعر فعلاً — حارسُ عطلٍ كان حيّاً.
 *
 * القصّة: سعر العرض كان يُحسب في متصفّح الزبون (`cart-storage.ts`) و
 * `place_order` يُسعّر من المنيو. فمن رأى «٣,٠٠٠ بدل ٥,٥٠٠» دُفع عنه ٥,٥٠٠،
 * ولا شيء على أي شاشة يقول إن الرقمين اختلفا.
 *
 * ويُفحص **آخر** ترحيلٍ يُعرّف الدالّة لا ترحيلٌ بعينه: `place_order` أُعيد
 * تعريفها خمس عشرة مرّة، وسقوط السطر في السادسة عشرة هو كيف يعود العطل.
 */

const DIR = new URL("../../../supabase/migrations/", import.meta.url);

function lastDefining(fn: string): string {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let found = "";
  for (const f of files) {
    const sql = readFileSync(new URL(f, DIR), "utf8");
    if (new RegExp(`FUNCTION public\\.${fn}\\b`, "i").test(sql)) found = sql;
  }
  return found;
}

describe("سعر العرض يصل إلى الطلب", () => {
  const sql = lastDefining("place_order");

  it("التسعير يمرّ بعرض اليوم", () => {
    expect(sql).toContain("apply_day_offer");
  });

  /*
   * ولا يُطبَّق على سعر الطالب: هو أقلّ أصلاً، وجمع الخصمين يبيع بأقلّ من
   * الكلفة. ولا على خيارٍ («كبير»): العرض يوضَع على الصنف لا على حجمه.
   */
  it("ولا يُطبَّق على سعر الطالب ولا على خيار", () => {
    // موضع النداء لا أوّل ذِكرٍ للاسم — الاسم يرد في تعليق الترحيل قبله
    const i = sql.indexOf("public.apply_day_offer(v_item.id");
    expect(i).toBeGreaterThan(0);
    const around = sql.slice(Math.max(0, i - 400), i);
    expect(around).toContain("not v_student");
    expect(around).toContain("v_variant.id is null");
  });

  /** والدالّة نفسها تأخذ الأقلّ — لا تستبدل بسعرٍ أعلى لو أُدخل خطأً */
  it("وتأخذ الأقلّ بين السعرين", () => {
    expect(lastDefining("apply_day_offer")).toContain("least(");
  });
});
