import { describe, expect, it } from "vitest";
import { maskHolyNames } from "./holy-names";

describe("maskHolyNames — الاسم يُقرأ والكلمة المقدّسة لا تُكتب كاملة", () => {
  it("لفظ الجلالة أينما وقع", () => {
    expect(maskHolyNames("عبدالله")).toBe("عبدا■ـه");
    expect(maskHolyNames("عبد الله")).toBe("عبد ا■ـه");
    expect(maskHolyNames("فتح الله محمد")).toBe("فتح ا■ـه محمد");
    expect(maskHolyNames("عبد الإله")).toBe("عبد ا■لا■ه");
  });

  it("الأسماء الحسنى بعد «عبد» فقط", () => {
    expect(maskHolyNames("عبد الرحمن")).toBe("عبد الر■من");
    expect(maskHolyNames("عبدالرحمن")).toBe("عبدالر■من");
    expect(maskHolyNames("عبد الكريم")).toBe("عبد الك■يم");
    expect(maskHolyNames("عبد الرؤوف")).toBe("عبد الر■وف");
    // «كريم» اسم إنسان — لا يُمسّ
    expect(maskHolyNames("كريم رحيم")).toBe("كريم رحيم");
    expect(maskHolyNames("عبد سامي")).toBe("عبد سامي");
  });

  it("الفراغ والأسماء العادية كما هي", () => {
    expect(maskHolyNames(null)).toBeNull();
    expect(maskHolyNames("نيكست")).toBe("نيكست");
    expect(maskHolyNames("عمر الأنباري")).toBe("عمر الأنباري");
  });
});
