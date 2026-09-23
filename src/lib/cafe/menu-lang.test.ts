import { describe, expect, it } from "vitest";
import { foldArabic, menuLangOf, pickName, pickText, searchMenu } from "./menu-lang";

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

describe("searchMenu", () => {
  const menu = [
    { name_ar: "برجر", items: [{ name_ar: "بركر لحم", name_en: "Beef Burger" }, { name_ar: "بركر دجاج", name_en: "Chicken Burger" }] },
    { name_ar: "مشروبات", items: [{ name_ar: "ببسي", name_en: "Pepsi" }, { name_ar: "آيس تي ليمون", name_en: "Lemon Iced Tea" }] },
  ];

  it("يجد بجزء من الاسم", () => {
    expect(searchMenu(menu, "بركر").map((i) => i.name_ar)).toEqual(["بركر لحم", "بركر دجاج"]);
  });

  it("يجد باسم القسم — «مشروبات» تعرض ما فيها", () => {
    expect(searchMenu(menu, "مشروبات")).toHaveLength(2);
  });

  it("يجد بالإنكليزية أيضاً", () => {
    expect(searchMenu(menu, "pepsi").map((i) => i.name_ar)).toEqual(["ببسي"]);
  });

  it("يتسامح مع الهمزة — «ايس» تجد «آيس»", () => {
    expect(searchMenu(menu, "ايس").map((i) => i.name_ar)).toEqual(["آيس تي ليمون"]);
  });

  it("لا شيء لبحثٍ فارغ، ولا شيء لما لا يوجد", () => {
    expect(searchMenu(menu, "")).toEqual([]);
    expect(searchMenu(menu, "   ")).toEqual([]);
    expect(searchMenu(menu, "سوشي")).toEqual([]);
  });
});

describe("foldArabic", () => {
  it("يطرح التشكيل ويوحّد الألف والتاء والياء", () => {
    expect(foldArabic("شَاوَرْمَة")).toBe("شاورمه");
    expect(foldArabic("إيــس")).toBe("ايس");
    expect(foldArabic("مصطفى")).toBe("مصطفي");
  });
});
