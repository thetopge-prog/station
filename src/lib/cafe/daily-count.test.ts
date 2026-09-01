import { describe, expect, it } from "vitest";
import { dailyCountDoc } from "./escpos";

/**
 * The slip's one job is the last line of arithmetic: counted − expected, said
 * in words a tired person reads correctly at midnight. A sign error here hands
 * somebody a paper that says «زيادة» over a genuine shortage.
 */
const base = {
  day: "2026-09-01",
  shopName: "ستيشن",
  opening_float: 50_000,
  cash_sales: 20_000,
  card_sales: 5_000,
  partner_sales: 7_000,
  expenses: 5_000,
  deposited: 0,
  debts_issued: 0,
  expected_cash: 65_000,
  counted_cash: 65_000,
  orders_count: 4,
  guests: 9,
  sales: 32_000,
  profit: 12_000,
  fixed_cost: 4_000,
  net: 8_000,
  stock_value: 300_000,
  partners_owed: 7_000,
  customers_owed: 0,
  note: null as string | null,
  by: "احمد",
};
const text = (d: ReturnType<typeof dailyCountDoc>) => d.lines.map((l) => l.t).join("\n");

describe("dailyCountDoc", () => {
  it("says مطابق when the drawer agrees", () => {
    expect(text(dailyCountDoc(base))).toContain("مطابق");
  });

  it("names a shortage as a shortage, not a negative surplus", () => {
    const out = text(dailyCountDoc({ ...base, counted_cash: 60_000 }));
    expect(out).toContain("عجز");
    expect(out).toContain("5,000");
    expect(out).not.toContain("زيادة");
  });

  it("names a surplus as a surplus", () => {
    const out = text(dailyCountDoc({ ...base, counted_cash: 70_000 }));
    expect(out).toContain("زيادة");
    expect(out).not.toContain("عجز");
  });

  it("carries the figures a dispute would be settled with", () => {
    const out = text(dailyCountDoc(base));
    for (const n of ["50,000", "20,000", "65,000", "32,000", "300,000"]) expect(out, n).toContain(n);
  });

  it("prints the note only when there is one, and always a line to sign", () => {
    expect(text(dailyCountDoc(base))).not.toContain("ملاحظة");
    expect(text(dailyCountDoc({ ...base, note: "نقص بنزين المولد" }))).toContain("نقص بنزين المولد");
    expect(text(dailyCountDoc(base))).toContain("التوقيع");
  });

  it("is a text-only document — no QR, and never opens the drawer", () => {
    const d = dailyCountDoc(base);
    expect(d.qr).toBeNull();
    expect(d.kick).toBe(false);
  });
});
