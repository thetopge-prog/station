import { describe, it, expect } from "vitest";
import { customSplit, formatIqd, formatIqdLabel } from "./money";

describe("money (IQD, integer)", () => {
  it("groups thousands with no decimals", () => {
    expect(formatIqd(2500)).toBe("2,500");
    expect(formatIqd(0)).toBe("0");
    expect(formatIqd(1000000)).toBe("1,000,000");
  });

  it("rounds fractional inputs to whole dinars", () => {
    expect(formatIqd(2500.6)).toBe("2,501");
  });

  it("appends the Arabic currency label", () => {
    expect(formatIqdLabel(3500)).toBe("3,500 د.ع");
  });
});

describe("customSplit — زاد: المندوب يدفع، والفرق أجرة توصيل", () => {
  it("فارغ: الإجمالي ناقص أجرة الشركة", () => {
    expect(customSplit(10000, 2000, null)).toEqual({ paid: 8000, commission: 2000 });
  });
  it("كتب الإجمالي كاملاً: الزبون دفع الأجرة للمندوب، لا شيء علينا", () => {
    expect(customSplit(10000, 2000, 10000)).toEqual({ paid: 10000, commission: 0 });
  });
  it("أكثر من الإجمالي يُقصّ إليه", () => {
    expect(customSplit(10000, 2000, 12000)).toEqual({ paid: 10000, commission: 0 });
  });
  it("أجرة تفوق الإجمالي: لا يدفع المندوب شيئاً", () => {
    expect(customSplit(1500, 2000, null)).toEqual({ paid: 0, commission: 1500 });
  });
});
