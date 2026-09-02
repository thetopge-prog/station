import { describe, expect, it } from "vitest";
import { groupPrinters, type SetupPrinter } from "./SetupClient";

/** الصفوف الخمسة كما هي في قاعدة المحل فعلاً. */
const shop: SetupPrinter[] = [
  { id: "till", name_ar: "طابعة الكاشير", kind: "receipt", station_name: null, share: "POS80", host: null, is_active: true },
  { id: "pizza", name_ar: "فرن البيتزا", kind: "station", station_name: "فرن البيتزا", share: null, host: null, is_active: false },
  { id: "burger", name_ar: "مطبخ البرجر والفرايس", kind: "station", station_name: "محطة البرجر", share: null, host: null, is_active: false },
  { id: "grill", name_ar: "الشواية", kind: "station", station_name: "الشواية", share: null, host: null, is_active: false },
  { id: "exp", name_ar: "تذكرة التجهيز", kind: "expediter", station_name: null, share: "POS80", host: null, is_active: true },
];

describe("groupPrinters", () => {
  it("shows the till as ONE button, because it is one device", () => {
    const till = groupPrinters(shop).find((g) => g.key === "till");
    expect(till?.ids.sort()).toEqual(["exp", "till"]);
    expect(till?.label).toContain("الكاشير");
    expect(till?.label).toContain("المجهّز");
  });

  it("gives every kitchen its own button, named after its station", () => {
    const labels = groupPrinters(shop).map((g) => g.label);
    expect(labels).toContain("طابعة فرن البيتزا");
    expect(labels).toContain("طابعة محطة البرجر");
    expect(labels).toContain("طابعة الشواية");
  });

  it("counts a printer as ready only when it is active AND addressable", () => {
    const g = groupPrinters(shop);
    expect(g.find((x) => x.key === "till")?.ready).toBe(true);
    expect(g.find((x) => x.key === "pizza")?.ready).toBe(false);
  });

  it("is not ready when the row is addressable but switched off", () => {
    const off = shop.map((p) => (p.kind === "receipt" ? { ...p, is_active: false } : p));
    expect(groupPrinters(off).find((x) => x.key === "till")?.ready).toBe(false);
  });

  it("never invents a button for a printer the shop does not have", () => {
    // «الكنتكي» ليست محطة — أصنافها موجّهة إلى الشواية، فلا زرّ لها
    expect(groupPrinters(shop).map((g) => g.label).join(" ")).not.toContain("كنتكي");
    expect(groupPrinters(shop)).toHaveLength(4);
  });

  it("survives a shop with no expediter row", () => {
    const g = groupPrinters(shop.filter((p) => p.kind !== "expediter"));
    expect(g.find((x) => x.key === "till")?.ids).toEqual(["till"]);
  });
});
