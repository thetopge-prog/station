import { describe, expect, it } from "vitest";
import { foldArabic, parseTotersScreen, resolveLines } from "./external-order";

/**
 * شاشة الطلب #908 كما صُوّرت على جهاز SUNMI — الأسطر كما تجمعها خدمة
 * إمكانية الوصول: نصّ كل عقدة مرئية بترتيب الشجرة.
 */
const SCREEN_908 = [
  "→",
  "١",
  "تحضير",
  "الطلب #٩٠٨",
  "٥١٣١٣-٧٩٩٠٨",
  "Maztotrz H",
  "هوية ٢٠٤٩٦٥٧٠٩٣٢",
  "تم",
  "اليوم في ١٠:٤٣ م",
  "بإنتظار بدء البحث عن سائق",
  "نمنحك دائماً بعض الوقت لتحضير الطلب قبل أن نبدأ بالبحث عن سائق.",
  "عنصران",
  "الصلصات",
  "١x",
  "صلصة هني ماسترد",
  "١,٠٠٠ د.ع. / عنصر",
  "١,٠٠٠ د.ع.",
  "وجبات الدجاج",
  "١x",
  "وجبة كنتاكي",
  "٩,٧٥٠ د.ع. / ٣ قطع",
  "٩,٧٥٠ د.ع.",
  "لديك ٢٥:٢٧ دقيقة متبقية للإرسال.",
  "الطلب جاهز",
];

describe("foldArabic", () => {
  it("folds the shapes that differ between a keyboard and a menu", () => {
    expect(foldArabic("صلصة  هني ماسترد")).toBe("صلصه هني ماسترد");
    expect(foldArabic("أجنحة")).toBe("اجنحه");
    expect(foldArabic("وجبة كنتاكي / ٣ قطع")).toBe("وجبه كنتاكي / 3 قطع");
    expect(foldArabic("سندويش زنجر")).toBe(foldArabic("سندويش زنجر  "));
  });
});

describe("parseTotersScreen", () => {
  const s = parseTotersScreen(SCREEN_908);

  it("reads the order number, the long reference and the customer", () => {
    expect(s.ref).toBe("908");
    expect(s.refLong).toBe("51313-79908");
    expect(s.customerName).toBe("Maztotrz H");
  });

  it("reads every item with its quantity and the option that changes it", () => {
    expect(s.items).toEqual([
      { name: "صلصة هني ماسترد", qty: 1, option: null },
      { name: "وجبة كنتاكي", qty: 1, option: "3 قطع" },
    ]);
  });

  it("accepts the other quantity spellings", () => {
    const t = parseTotersScreen(["الطلب #12", "2 x", "سندويش زنجر", "13,500 د.ع.", "x3", "ثومية", "3,000 د.ع. / عنصر"]);
    expect(t.items).toEqual([
      { name: "سندويش زنجر", qty: 2, option: null },
      { name: "ثومية", qty: 3, option: null },
    ]);
  });
});

describe("resolveLines", () => {
  const aliases = [
    { alias_key: foldArabic("وجبة كنتاكي / 3 قطع"), item_id: "k3", variant_id: null, flavor: null },
    { alias_key: foldArabic("وجبة كنتاكي"), item_id: "k3-default", variant_id: null, flavor: null },
    { alias_key: foldArabic("صلصة هني ماسترد"), item_id: "honey", variant_id: null, flavor: null },
    { alias_key: foldArabic("سندويش زنجر"), item_id: "zinger", variant_id: "meal", flavor: null },
  ];
  const menu = [{ id: "pepsi", name_ar: "ببسي" }];

  it("prefers name + option, then name, then our own menu name", () => {
    const r = resolveLines(
      [
        { name: "وجبة كنتاكي", qty: 1, option: "3 قطع" },
        { name: "وجبة كنتاكي", qty: 2, option: "8 قطع" },
        { name: "سندويش زنجر", qty: 1, option: null },
        { name: "ببسي", qty: 1, option: null },
      ],
      aliases,
      menu,
    );
    expect(r.unknown).toEqual([]);
    expect(r.lines).toEqual([
      { item_id: "k3", variant_id: null, flavor: null, qty: 1 },
      { item_id: "k3-default", variant_id: null, flavor: null, qty: 2 },
      { item_id: "zinger", variant_id: "meal", flavor: null, qty: 1 },
      { item_id: "pepsi", variant_id: null, flavor: null, qty: 1 },
    ]);
  });

  it("never invents: an unknown name comes back as the alert's text", () => {
    const r = resolveLines([{ name: "صلصة ستيشن", qty: 1, option: null }], aliases, menu);
    expect(r.lines).toEqual([]);
    expect(r.unknown).toEqual(["صلصة ستيشن"]);
  });
});
