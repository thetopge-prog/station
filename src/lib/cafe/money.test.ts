import { describe, it, expect } from "vitest";
import { formatIqd, formatIqdLabel } from "./money";

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
