import { describe, expect, it } from "vitest";
import { customerNameFrom } from "./wa-name";

/**
 * الخطأ هنا يقع على الزبون مباشرةً: تحيّةٌ باسمٍ ليس اسمه. فالاختبار على
 * الرفض قبل القبول — ما يُشكّ فيه يُترك، ويُحيّا تحيّةً عامّة.
 */
describe("customerNameFrom", () => {
  it("يقبل الاسم الواضح، ويُنادي بالأول منه", () => {
    expect(customerNameFrom("احمد")).toBe("احمد");
    expect(customerNameFrom("احمد محمد علي")).toBe("احمد");
    expect(customerNameFrom("  مصطفى  ")).toBe("مصطفى");
    expect(customerNameFrom("Ahmed")).toBe("Ahmed");
    expect(customerNameFrom("فاطمة")).toBe("فاطمة");
  });

  it("«عبد الله» مفصولةً تُقرأ اسماً واحداً", () => {
    expect(customerNameFrom("عبدالله")).toBe("عبدالله");
    expect(customerNameFrom("عبد الرحمن الجميلي")).toBe("عبد الرحمن");
  });

  it("يرفض الألقاب — «عاشق ولهان» لا يُنادى به أحد", () => {
    for (const nick of ["عاشق ولهان", "ذيب الصحراء", "الغريب", "قلب حزين", "ملك الاحزان", "دلوعة بابا"]) {
      expect(customerNameFrom(nick), nick).toBeNull();
    }
  });

  it("يرفض الزخرفة والرموز والأرقام", () => {
    for (const bad of ["𝓐𝓱𝓶𝓮𝓭", "احمد ♥", "احمد 2005", "🔥احمد🔥", "..", "", "   "]) {
      expect(customerNameFrom(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("يرفض ما ليس اسماً أصلاً", () => {
    expect(customerNameFrom(null)).toBeNull();
    expect(customerNameFrom(undefined)).toBeNull();
    expect(customerNameFrom("ا")).toBeNull();
    expect(customerNameFrom("ابومحمدالعراقي2")).toBeNull();
  });
});
