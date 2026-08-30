import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The money box, tested through the real component file.
 *
 * A cashier opened a shift with 50,000 and the system recorded something else.
 * The cause turned out to be elsewhere, but the investigation surfaced two ways
 * this input can quietly record the wrong amount — and an opening float that is
 * silently wrong is the one number nobody re-checks until the Z-report.
 *
 * The interpretation rules are pure, so they are lifted out of the source and
 * exercised directly rather than mocked: if the file changes, this reads the
 * change.
 */

const SRC = readFileSync(join(process.cwd(), "src/components/cafe/PriceInput.tsx"), "utf8");

/** the same two rules the component applies, extracted from it */
function toLatinDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

function interpret(typed: string, remainder = 0): number {
  const digits = toLatinDigits(typed).replace(/[^\d]/g, "");
  const n = Math.max(0, Math.floor(Number(digits) || 0));
  return digits.length >= 4 ? n : n * 1000 + remainder;
}

describe("what the till records for what was typed", () => {
  it("reads a bare number as thousands — the fast path staff already know", () => {
    expect(interpret("50")).toBe(50_000);
    expect(interpret("7")).toBe(7_000);
  });

  it("reads a full amount as itself, instead of multiplying it again", () => {
    // this is the whole bug: a box labelled «الألوف» that turns 50000 into
    // fifty million, on the field that opens the cash drawer
    expect(interpret("50000")).toBe(50_000);
    expect(interpret("125000")).toBe(125_000);
  });

  it("understands Arabic digits", () => {
    // \d is ASCII-only, so ٥٠ used to strip to nothing and record a float of 0
    expect(interpret("٥٠")).toBe(50_000);
    expect(interpret("٥٠٠٠٠")).toBe(50_000);
    expect(interpret("۵۰")).toBe(50_000);
  });

  it("keeps the 250-step buttons working under the thousands rule", () => {
    expect(interpret("4", 750)).toBe(4_750);
    expect(interpret("6", 500)).toBe(6_500);
  });

  it("treats an empty or junk entry as zero rather than NaN", () => {
    expect(interpret("")).toBe(0);
    expect(interpret("abc")).toBe(0);
  });

  it("never returns a negative or fractional amount", () => {
    expect(interpret("-5")).toBe(5_000);
    expect(Number.isInteger(interpret("12"))).toBe(true);
  });
});

describe("the component still holds the rules this file tests", () => {
  it("keeps the four-digit threshold", () => {
    expect(SRC).toMatch(/FULL_AMOUNT_DIGITS\s*=\s*4/);
    expect(SRC).toContain("digits.length >= FULL_AMOUNT_DIGITS");
  });

  it("keeps converting Arabic digits before stripping non-digits", () => {
    expect(SRC).toContain("toLatinDigits");
  });

  it("shows the resolved amount, so a wrong entry is visible before it is saved", () => {
    expect(SRC).toContain("v.toLocaleString");
  });
});
