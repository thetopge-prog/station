import { describe, expect, it } from "vitest";
import { menuLangOf, pickName, pickText } from "./menu-lang";

describe("menuLangOf", () => {
  it("العربية وحدها عربية، وما عداها إنكليزي", () => {
    expect(menuLangOf("ar")).toBe("ar");
    for (const l of ["en", "tr", "it", "ku", "de", ""]) expect(menuLangOf(l)).toBe("en");
  });
});

describe("pickName", () => {
  it("يأخذ الإنكليزي حين يوجد", () => {
    expect(pickName({ name_ar: "بركر لحم", name_en: "Beef Burger" }, "en")).toBe("Beef Burger");
  });

  it("يرجع للعربي حين لا ترجمة — فراغٌ على الشاشة أسوأ من اسمٍ بلغةٍ أخرى", () => {
    expect(pickName({ name_ar: "صنف جديد", name_en: null }, "en")).toBe("صنف جديد");
    expect(pickName({ name_ar: "صنف جديد", name_en: "   " }, "en")).toBe("صنف جديد");
    expect(pickName({ name_ar: "صنف جديد" }, "en")).toBe("صنف جديد");
  });

  it("لا يستعمل الإنكليزي على صفحة عربية", () => {
    expect(pickName({ name_ar: "بركر لحم", name_en: "Beef Burger" }, "ar")).toBe("بركر لحم");
  });
});

describe("pickText", () => {
  it("يفضّل الإنكليزي ثم العربي ثم لا شيء", () => {
    expect(pickText("وصف", "desc", "en")).toBe("desc");
    expect(pickText("وصف", null, "en")).toBe("وصف");
    expect(pickText(null, null, "en")).toBeNull();
    expect(pickText("وصف", "desc", "ar")).toBe("وصف");
  });
});
