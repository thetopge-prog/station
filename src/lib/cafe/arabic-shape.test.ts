import { describe, it, expect } from "vitest";
import { shapeArabic, hasArabic } from "./arabic-shape";

/** readable assertion helper: presentation-form codepoints, in print order */
const cps = (s: string) => [...s].map((c) => c.codePointAt(0)!.toString(16).toUpperCase());

describe("arabic shaping for thermal printers", () => {
  it("picks initial / medial / final forms by context", () => {
    // برجر → ب initial, ر final, ج initial, ر final … then reversed for print
    expect(cps(shapeArabic("برجر"))).toEqual(["FEAE", "FE9F", "FEAE", "FE91"]);
  });

  it("leaves a non-connecting letter isolated at the start of a word", () => {
    // ا never joins forward, so الـ is ا(isolated) + ل(initial)
    const out = cps(shapeArabic("العراق"));
    expect(out[out.length - 1]).toBe("FE8D"); // ا isolated, printed last = shown first
    expect(out).toContain("FECC"); // ـعـ medial
  });

  it("collapses لا into one ligature glyph", () => {
    expect(cps(shapeArabic("لا"))).toEqual(["FEFB"]);
    // after a connecting letter it takes the final ligature instead
    expect(cps(shapeArabic("بلا"))).toEqual(["FEFC", "FE91"]);
  });

  it("reverses Arabic but keeps numbers and Latin left-to-right", () => {
    const out = shapeArabic("برجر 2");
    // the digit survives untouched and stays a digit
    expect(out).toContain("2");
    expect(cps(out).filter((c) => c.startsWith("FE"))).toHaveLength(4);
  });

  it("drops diacritics rather than trying to stack them", () => {
    expect(shapeArabic("بَرْجَر")).toBe(shapeArabic("برجر"));
  });

  it("shapes the Farsi چ used in «ساندويچ»", () => {
    expect(cps(shapeArabic("ساندويچ")).includes("FB7B")).toBe(true); // چ final
  });

  it("passes non-Arabic through unchanged", () => {
    expect(shapeArabic("Station 7,750 IQD")).toBe("Station 7,750 IQD");
  });

  it("detects Arabic content", () => {
    expect(hasArabic("برجر")).toBe(true);
    expect(hasArabic("Station")).toBe(false);
  });
});
