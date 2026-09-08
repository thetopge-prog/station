import { describe, it, expect } from "vitest";
import { cleanPhone, normalizeIraqiPhone, phoneDigits } from "./phone";

describe("phone folding", () => {
  it("folds every arrival shape into 07XXXXXXXXX", () => {
    for (const raw of ["+9647801234567", "009647801234567", "07801234567", "7801234567", "{ 0780 123 4567 }", "٠٧٨٠١٢٣٤٥٦٧"]) {
      expect(normalizeIraqiPhone(raw)).toBe("07801234567");
    }
  });

  it("refuses what is not an Iraqi mobile", () => {
    expect(normalizeIraqiPhone("1800699787")).toBeNull();
    expect(normalizeIraqiPhone("")).toBeNull();
    expect(normalizeIraqiPhone("abc")).toBeNull();
  });

  // the receipt line «{ 1800 699 787 }»: braces and spaces reach the paper
  // and the RTL renderer reverses the groups. Digits only, one run.
  it("keeps the cashier's digits when they are not a mobile, and nothing else", () => {
    expect(cleanPhone("{ 1800 699 787 }")).toBe("1800699787");
    expect(cleanPhone("{ 0787 699 1800 }")).toBe("07876991800");
    expect(cleanPhone("  ")).toBeNull();
    expect(cleanPhone(null)).toBeNull();
    expect(phoneDigits("٠٧٨-٧")).toBe("0787");
  });
});
