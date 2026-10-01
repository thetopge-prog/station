import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmText, itemLines, serveLabel, totalLines } from "./order-summary";

const ITEMS = [
  { name_ar: "بركر لحم بالجبن", flavor_ar: null, qty: 2, line_total: 12000 },
  { name_ar: "فنكر كوب", flavor_ar: "صوص", qty: 1, line_total: 2000 },
];

describe("نوع الطلب كما يُقال للزبون", () => {
  /*
   * الفخّ: النوع ليس في عمودٍ واحد. «على ميز» و«سفري» و«الموقف» وسومٌ داخل
   * `note` كتبها serve_my_order / park_my_order بعد الطلب — فمن قرأ القناة
   * وحدها قال «استلام من الكاونتر» لزبونٍ اختار أن يجلس على طاولة.
   */
  it("الاستلام يتبع ما اختاره بعد الطلب لا القناة", () => {
    expect(serveLabel("pickup", "بدون بصل · 🍽 على ميز")).toContain("ميز");
    expect(serveLabel("pickup", "🥡 سفري")).toContain("سفري");
    expect(serveLabel("pickup", null)).toContain("الكاونتر");
  });

  it("والسيارة تحمل الموقف إن كُتب", () => {
    expect(serveLabel("curbside", "📍 كدام الباب")).toContain("كدام الباب");
    expect(serveLabel("curbside", null)).toContain("السيارة");
  });

  it("والطاولة ترقمها", () => {
    expect(serveLabel("qr", null, "7")).toContain("7");
    expect(serveLabel("qr", null, null)).toContain("داخل المطعم");
  });

  it("والتوصيل توصيل", () => {
    expect(serveLabel("delivery", null)).toContain("توصيل");
  });

  /** قناةٌ لم تخطر ببالنا يجب ألّا تُخرج نصّاً فارغاً */
  it("وقناة مجهولة لا تُخرج فراغاً", () => {
    expect(serveLabel("kiosk", null).length).toBeGreaterThan(3);
    expect(serveLabel(null, null).length).toBeGreaterThan(3);
  });
});

describe("المجموع", () => {
  it("بلا خصم: سطر واحد", () => {
    expect(totalLines({ subtotal: 14000 }).join("\n")).toContain("14,000");
  });

  /** رقمٌ أقلّ بلا سببٍ مكتوب يُقرأ خطأً — الخصم يُذكر */
  it("ومع خصم يُذكر الخصم ويُحسب الباقي", () => {
    const t = totalLines({ subtotal: 14000, discount: 2000 }).join("\n");
    expect(t).toContain("2,000");
    expect(t).toContain("12,000");
  });

  it("والإضافة تُجمع", () => {
    expect(totalLines({ subtotal: 10000, extra: 1000 }).join("\n")).toContain("11,000");
  });

  /** لا مجموع سالب مهما كان الخصم */
  it("ولا ينزل تحت الصفر", () => {
    expect(totalLines({ subtotal: 5000, discount: 9000 }).join("\n")).toContain("0 د.ع");
  });
});

describe("سرد الأصناف", () => {
  it("كمّية واسم ومبلغ", () => {
    const l = itemLines(ITEMS);
    expect(l[0]).toContain("2 ×");
    expect(l[0]).toContain("بركر لحم بالجبن");
    expect(l[1]).toContain("صوص");
  });

  /** طلبٌ كبير لا يصير جداراً على شاشة هاتف */
  it("ويُقصّ الطويل ويُعدّ باقيه", () => {
    const many = Array.from({ length: 12 }, () => ITEMS[0]);
    const l = itemLines(many);
    expect(l).toHaveLength(9);
    expect(l[8]).toContain("4");
  });
});

describe("رسالة التأكيد كاملة", () => {
  const txt = confirmText({
    orderNo: "042",
    items: ITEMS,
    subtotal: 14000,
    channel: "pickup",
    note: "🍽 على ميز",
  });

  it("فيها الرقم والأصناف والمجموع والنوع — الأربعة التي طلبتها الإدارة", () => {
    expect(txt).toContain("042");
    expect(txt).toContain("بركر لحم بالجبن");
    expect(txt).toContain("14,000");
    expect(txt).toContain("ميز");
  });

  /** واتساب لا يعرف HTML؛ المحوّل في customer-notify يقلب <b> إلى نجمتين */
  it("ولا وسوم غير <b> — المحوّل لا يعرف غيرها", () => {
    const tags = [...txt.matchAll(/<\/?([a-z]+)>/g)].map((m) => m[1]);
    expect([...new Set(tags)]).toEqual(["b"]);
  });

  /** طلبٌ بلا أصناف (عطل قراءة) يجب أن يبقى رسالةً مفهومة لا سطراً مبتوراً */
  it("وبلا أصناف تبقى مفهومة", () => {
    const bare = confirmText({ orderNo: "007", items: [], subtotal: 0, channel: "delivery" });
    expect(bare).toContain("007");
    expect(bare).toContain("توصيل");
  });
});

describe("رابط التقييم", () => {
  const brand = readFileSync(new URL("../brand.ts", import.meta.url), "utf8");

  /*
   * المعرّف مؤكَّد مرّتين: المالك أكّد البطاقة، وإحداثياتها تطابق `geo`.
   * ومن بدّله بمعرّفٍ آخر يرسل الزبائن ليقيّموا مطعماً ليس مطعمنا.
   */
  it("يحمل معرّف البطاقة المؤكَّدة", () => {
    expect(brand).toContain("ChIJjxNSuNpdWhURhpve7Roef_g");
  });

  it("والإحداثيات هي التي أكّدته", () => {
    expect(brand).toContain("33.4158031");
    expect(brand).toContain("43.3016279");
  });
});
