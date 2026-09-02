import { describe, expect, it } from "vitest";
import { sinceLabel } from "./time";

describe("sinceLabel", () => {
  it("never prints a four-digit minute count", () => {
    // شريط الوردية بلغ «٢١١٧ د» — هذا هو العطل المبلَّغ عنه
    expect(sinceLabel(2117)).not.toContain("2117");
    expect(sinceLabel(2117)).toBe("يوم");
  });

  it("says الآن for the first minute", () => {
    expect(sinceLabel(0)).toBe("الآن");
    expect(sinceLabel(0.4)).toBe("الآن");
  });

  it("keeps minutes while minutes still matter", () => {
    expect(sinceLabel(1)).toBe("1 د");
    expect(sinceLabel(59)).toBe("59 د");
  });

  it("switches to hours at sixty, and drops the minutes once they stop mattering", () => {
    expect(sinceLabel(60)).toBe("1 س");
    expect(sinceLabel(95)).toBe("1 س 35 د");
    expect(sinceLabel(400)).toBe("6 س");
  });

  it("switches to days at twenty-four hours", () => {
    expect(sinceLabel(1440)).toBe("يوم");
    expect(sinceLabel(2880)).toBe("2 يوم");
  });

  it("survives nonsense without printing it", () => {
    expect(sinceLabel(-5)).toBe("الآن");
    expect(sinceLabel(Number.NaN)).toBe("الآن");
  });
});
