import { describe, expect, it } from "vitest";
import { nameWithPhoneError, needsName } from "./customer-required";

/**
 * القاعدة تقف أمام كل بيعٍ في المحلّ — فالاختبار على حدودها لا على وسطها:
 * البيع النقدي السريع يجب أن يمرّ، والرقم بلا اسم يجب أن يقف.
 */
describe("nameWithPhoneError", () => {
  it("يمرّ بيع الكاونتر بلا هاتف — وهو ثلثا الطلبات", () => {
    expect(nameWithPhoneError(null, null)).toBeNull();
    expect(nameWithPhoneError("", "")).toBeNull();
    expect(nameWithPhoneError("   ", null)).toBeNull();
  });

  it("يمنع الرقم بلا اسم", () => {
    expect(nameWithPhoneError("07801234567", null)).toContain("اسم الزبون");
    expect(nameWithPhoneError("07801234567", "  ")).not.toBeNull();
  });

  it("حرفٌ واحد ليس اسماً", () => {
    expect(nameWithPhoneError("07801234567", "ا")).not.toBeNull();
    expect(nameWithPhoneError("07801234567", "عل")).toBeNull();
  });

  it("يمرّ الرقم مع اسمه", () => {
    expect(nameWithPhoneError("07801234567", "أحمد")).toBeNull();
    expect(nameWithPhoneError("{ 780 123 4567 }", "أبو علي")).toBeNull();
  });

  it("الاسم بلا رقم لا يُطلب معه شيء", () => {
    expect(nameWithPhoneError(null, "أحمد")).toBeNull();
  });

  it("needsName مرآةُ الرسالة", () => {
    expect(needsName("07801234567", "")).toBe(true);
    expect(needsName("", "")).toBe(false);
  });
});
