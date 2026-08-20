import { describe, it, expect } from "vitest";
import { lineTotal, orderSubtotal, orderTotal } from "./order";

describe("order math", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotal(3500, 2)).toBe(7000);
    expect(lineTotal(2500, 1)).toBe(2500);
  });

  it("guards against negative/fractional quantities", () => {
    expect(lineTotal(2500, -3)).toBe(0);
    expect(lineTotal(2500, 1.9)).toBe(2500);
  });

  it("sums a cart", () => {
    const lines = [
      { unitPrice: 3500, qty: 2 }, // 7000
      { unitPrice: 2500, qty: 1 }, // 2500
    ];
    expect(orderSubtotal(lines)).toBe(9500);
  });

  it("applies a discount, floored at zero", () => {
    const lines = [{ unitPrice: 3000, qty: 1 }];
    expect(orderTotal(lines, 500)).toBe(2500);
    expect(orderTotal(lines, 999999)).toBe(0);
    expect(orderTotal(lines, -100)).toBe(3000);
  });
});
