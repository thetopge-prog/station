import { describe, expect, it } from "vitest";
import { e164, toCsv, toVcf } from "./contacts-export";

/**
 * ملفٌّ يُفتح على هاتف المالك ويُرفع إلى أداة إعلان — لا فرصة لتصحيحه هناك.
 * فالاختبار على ما يكسره فعلاً: اسمٌ فيه فاصلة، ورقمٌ تالف، وقائمة فارغة.
 */
describe("e164", () => {
  it("يحوّل الشكل المحلّي إلى الدولي", () => {
    expect(e164("07801234567")).toBe("+9647801234567");
  });

  it("يقبل ما هو دولي أصلاً", () => {
    expect(e164("9647801234567")).toBe("+9647801234567");
  });

  it("يردّ الرقم الناقص فارغاً بدل أن يخترع له صيغة", () => {
    for (const bad of ["6062", "86", "0780123456", "", null]) expect(e164(bad)).toBeNull();
  });
});

describe("toVcf", () => {
  it("يكتب بطاقة لكل رقم صالح", () => {
    const out = toVcf([{ name: "أحمد", phone: "07801234567" }]);
    expect(out).toContain("BEGIN:VCARD");
    expect(out).toContain("FN:أحمد");
    expect(out).toContain("TEL;TYPE=CELL:+9647801234567");
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("يهرّب الفاصلة والفاصلة المنقوطة فلا تُقرآن فاصلَ حقول", () => {
    expect(toVcf([{ name: "Abu Ali, Garage; 2", phone: "07801234567" }])).toContain("FN:Abu Ali\\, Garage\\; 2");
  });

  it("الفاصلة العربية ليست من رموز الصيغة — تمرّ كما هي", () => {
    expect(toVcf([{ name: "أبو علي، الكراج", phone: "07801234567" }])).toContain("FN:أبو علي، الكراج");
  });

  it("يسقط الرقم التالف ولا يُدخله دفتر أحد", () => {
    expect(toVcf([{ name: "خطأ", phone: "6062" }])).toBe("");
  });

  it("يضع الرقم اسماً حين لا اسم", () => {
    expect(toVcf([{ name: null, phone: "07801234567" }])).toContain("FN:+9647801234567");
  });

  it("قائمة فارغة تُنتج ملفاً فارغاً لا ملفاً مكسوراً", () => {
    expect(toVcf([])).toBe("");
  });
});

describe("toCsv", () => {
  it("يبدأ بـBOM كي يفتحه إكسل عربياً", () => {
    expect(toCsv([]).startsWith("﻿")).toBe(true);
  });

  it("يقتبس الخلية التي فيها فاصلة فلا تُزيح الأعمدة", () => {
    const line = toCsv([{ name: "Abu Ali, Garage", phone: "07801234567", orders_count: 3, total_spent: 45000 }]).split("\r\n")[1];
    expect(line.startsWith('"Abu Ali, Garage",')).toBe(true);
  });

  it("الفاصلة العربية حرفٌ عادي لا فاصلُ حقل، فلا تُقتبس بلا داعٍ", () => {
    const line = toCsv([{ name: "أبو علي، الكراج", phone: "07801234567" }]).split("\r\n")[1];
    expect(line.startsWith("أبو علي، الكراج,")).toBe(true);
    expect(line.split(",")).toHaveLength(6);
  });

  it("يضاعف الاقتباس داخل الاقتباس", () => {
    expect(toCsv([{ name: 'محل "الشام"', phone: "07801234567" }])).toContain('"محل ""الشام"""');
  });

  it("يُبقي الصفّ ذا الرقم التالف — التصحيح شغل الإدارة لا حذفٌ صامت", () => {
    const out = toCsv([{ name: "خطأ", phone: "6062" }]);
    expect(out).toContain("6062");
  });
});
