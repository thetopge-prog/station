import { describe, expect, it } from "vitest";
import { foldShortages } from "./shortage";

const row = (name: string, qty: number, price: number, at: string) => ({
  name_ar: name,
  qty,
  unit_price: price,
  unavailable_at: at,
});

describe("foldShortages", () => {
  it("counts occurrences, quantities and lost money per name", () => {
    const [first] = foldShortages([
      row("جبن", 2, 1000, "2026-08-30T10:00:00Z"),
      row("جبن", 1, 1000, "2026-08-29T10:00:00Z"),
    ]);
    expect(first).toEqual({ name: "جبن", times: 2, qty: 3, lost: 3000, lastAt: "2026-08-30T10:00:00Z" });
  });

  it("takes «آخر مرة» from the newest row, given newest-first input", () => {
    const [only] = foldShortages([
      row("ستربس", 1, 5000, "2026-08-30T20:00:00Z"),
      row("ستربس", 1, 5000, "2026-08-01T09:00:00Z"),
    ]);
    expect(only.lastAt).toBe("2026-08-30T20:00:00Z");
  });

  it("puts the most frequent shortage first — it is the shopping list", () => {
    const out = foldShortages([
      row("بطاطا", 1, 1000, "2026-08-30T10:00:00Z"),
      row("جبن", 1, 1000, "2026-08-30T09:00:00Z"),
      row("جبن", 1, 1000, "2026-08-29T09:00:00Z"),
    ]);
    expect(out.map((r) => r.name)).toEqual(["جبن", "بطاطا"]);
  });

  it("breaks a tie on lost money, not alphabetically — equal counts are not equally urgent", () => {
    const out = foldShortages([
      row("كولا", 1, 1000, "2026-08-30T10:00:00Z"),
      row("دجاج", 1, 12000, "2026-08-30T09:00:00Z"),
    ]);
    expect(out[0].name).toBe("دجاج");
  });

  it("ignores rows that never ran out", () => {
    expect(foldShortages([{ name_ar: "برجر", qty: 1, unit_price: 7000, unavailable_at: null }])).toEqual([]);
  });
});
