import { describe, it, expect } from "vitest";
import { businessDay, lastNDays } from "./time";

describe("Baghdad business day (UTC+3, no DST)", () => {
  it("attributes an evening UTC instant to the correct Baghdad day", () => {
    // 20:00Z = 23:00 Baghdad → same date
    expect(businessDay(new Date("2026-07-22T20:00:00Z"))).toBe("2026-07-22");
  });

  it("rolls to the next day after Baghdad midnight", () => {
    // 21:30Z = 00:30 Baghdad next day
    expect(businessDay(new Date("2026-07-22T21:30:00Z"))).toBe("2026-07-23");
  });

  it("builds an inclusive N-day range ending today", () => {
    const now = new Date("2026-07-22T09:00:00Z"); // 12:00 Baghdad
    expect(lastNDays(7, now)).toEqual(["2026-07-16", "2026-07-22"]);
    expect(lastNDays(1, now)).toEqual(["2026-07-22", "2026-07-22"]);
  });
});
