import { describe, expect, it } from "vitest";
import { missingFields } from "./fulfilment";

/**
 * آخر بوّابة قبل «إتمام الطلب» على شاشة الزبون. شرطٌ زائد هنا يعني سلّة
 * مهجورة لا شكوى، وشرطٌ ناقص يعني طلباً يصل المطبخ ولا يُعرَف صاحبه.
 */
const f = (p: Partial<{ name: string; phone: string; address: string }> = {}) => ({
  name: "",
  phone: "",
  address: "",
  ...p,
});

describe("missingFields", () => {
  it("يطلب اختيار الطريقة أولاً", () => {
    expect(missingFields(null, f())).toBe("اختر طريقة الاستلام");
  });

  it("الأكل في المطعم يمرّ بلا رقم ولا اسم", () => {
    expect(missingFields("dinein", f())).toBeNull();
  });

  it("الاستلام من المطعم بلا رقم يمرّ — الرقم اختياري فيه", () => {
    expect(missingFields("pickup", f())).toBeNull();
  });

  it("التوصيل يطلب الرقم ثم الاسم ثم العنوان، بهذا الترتيب", () => {
    expect(missingFields("delivery", f())).toBe("رقم الهاتف مطلوب");
    expect(missingFields("delivery", f({ phone: "07801234567" }))).toContain("اسم الزبون");
    expect(missingFields("delivery", f({ phone: "07801234567", name: "أحمد" }))).toBe("العنوان مطلوب للتوصيل");
    expect(missingFields("delivery", f({ phone: "07801234567", name: "أحمد", address: "حي الضباط" }))).toBeNull();
  });

  it("رقمٌ اختياري كُتب في الاستلام يجرّ اسمه معه", () => {
    expect(missingFields("pickup", f({ phone: "07801234567" }))).toContain("اسم الزبون");
    expect(missingFields("pickup", f({ phone: "07801234567", name: "أحمد" }))).toBeNull();
  });

  it("السيارة تطلب الرقم والاسم ولا تطلب عنواناً", () => {
    expect(missingFields("curbside", f({ phone: "07801234567", name: "أحمد" }))).toBeNull();
  });
});
