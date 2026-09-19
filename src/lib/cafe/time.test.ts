import { describe, it, expect } from "vitest";
import { businessDay, lastNDays, lateCutoffState } from "./time";

describe("Baghdad business day (UTC+3, no DST)", () => {
  it("attributes an evening UTC instant to the correct Baghdad day", () => {
    // 20:00Z = 23:00 Baghdad → same date
    expect(businessDay(new Date("2026-07-22T20:00:00Z"))).toBe("2026-07-22");
  });

  it("keeps the small hours on the shift that sold them — the day cuts at 04:00 Baghdad", () => {
    // 02:30 Baghdad = 23:30 UTC the day before
    expect(businessDay(new Date("2026-07-22T23:30:00Z"))).toBe("2026-07-22");
    // 04:30 Baghdad = 01:30 UTC
    expect(businessDay(new Date("2026-07-23T01:30:00Z"))).toBe("2026-07-23");
  });

  it("rolls to the next day after Baghdad midnight", () => {
    // 21:30Z = 00:30 Baghdad next day
    expect(businessDay(new Date("2026-07-23T01:30:00Z"))).toBe("2026-07-23");
  });

  it("builds an inclusive N-day range ending today", () => {
    const now = new Date("2026-07-22T09:00:00Z"); // 12:00 Baghdad
    expect(lastNDays(7, now)).toEqual(["2026-07-16", "2026-07-22"]);
    expect(lastNDays(1, now)).toEqual(["2026-07-22", "2026-07-22"]);
  });
});

describe("lateCutoffState — kitchen section closes 02:00 Baghdad (UTC+3)", () => {
  const at = (utc: string) => lateCutoffState(new Date(utc));
  it("is open before 01:00 and after 09:00", () => {
    expect(at("2026-09-19T21:59:00Z").phase).toBe("open"); // 00:59
    expect(at("2026-09-20T06:00:00Z").phase).toBe("open"); // 09:00
    expect(at("2026-09-19T18:00:00Z").phase).toBe("open"); // 21:00
  });
  it("counts down from 01:00", () => {
    expect(at("2026-09-19T22:00:00Z")).toEqual({ phase: "countdown", minutesLeft: 60 }); // 01:00
    expect(at("2026-09-19T22:01:00Z")).toEqual({ phase: "countdown", minutesLeft: 59 }); // 01:01
  });
  it("warns from 01:30 and closes at 02:00 until 09:00", () => {
    expect(at("2026-09-19T22:31:00Z")).toEqual({ phase: "notice", minutesLeft: 29 }); // 01:31
    expect(at("2026-09-19T23:00:00Z")).toEqual({ phase: "closed", minutesLeft: 0 }); // 02:00
    expect(at("2026-09-20T05:59:00Z").phase).toBe("closed"); // 08:59
  });
});
