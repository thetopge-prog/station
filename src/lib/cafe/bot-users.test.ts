import { describe, expect, it } from "vitest";
import { cartSum, localPhone, stepLabel } from "./bot-users";

describe("رقم واتساب", () => {
  it("يردّ المعرّف العراقي إلى 07…", () => {
    expect(localPhone("9647831551888")).toBe("07831551888");
    expect(localPhone("00964 783 155 1888")).toBe("07831551888");
  });

  it("وغير العراقي لا يُلوى ليصير عراقياً", () => {
    expect(localPhone("905013196750")).toBeNull();
    expect(localPhone("995555004471")).toBeNull();
    expect(localPhone("16465894168")).toBeNull();
  });
});

describe("السلّة المعلّقة", () => {
  it("تُجمع كميّةً وسعراً — وهي ما كاد أن يُباع", () => {
    const s = cartSum([{ qty: 2, unitPrice: 12000 }, { qty: 1, unitPrice: 4750 }]);
    expect(s.count).toBe(3);
    expect(s.total).toBe(28750);
  });

  it("وسلّةٌ ناقصة لا تُفشل الجدول", () => {
    expect(cartSum(undefined)).toEqual({ count: 0, total: 0 });
    expect(cartSum([{ name: "بيتزا" }])).toEqual({ count: 0, total: 0 });
  });
});

describe("الخطوة", () => {
  it("تُترجَم عربيةً، والمجهولة تصير شرطة لا اسماً إنجليزياً", () => {
    expect(stepLabel("address")).toBe("عند طلب العنوان");
    expect(stepLabel("something")).toBe("—");
    expect(stepLabel(undefined)).toBe("—");
  });
});
