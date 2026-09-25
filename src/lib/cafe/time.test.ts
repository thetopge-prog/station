import { describe, it, expect } from "vitest";
import { businessDay, lastNDays, lateCloseLabel, lateCutoffState } from "./time";

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

describe("lateCutoffState — kitchen section closes 02:30 Baghdad (UTC+3)", () => {
  const at = (utc: string) => lateCutoffState(new Date(utc));
  it("is open before 01:30 and from 09:00", () => {
    expect(at("2026-09-19T22:29:00Z").phase).toBe("open"); // 01:29
    expect(at("2026-09-20T06:00:00Z").phase).toBe("open"); // 09:00
    expect(at("2026-09-19T18:00:00Z").phase).toBe("open"); // 21:00
  });
  it("counts down from 01:30", () => {
    expect(at("2026-09-19T22:30:00Z")).toEqual({ phase: "countdown", minutesLeft: 60 }); // 01:30
    expect(at("2026-09-19T22:31:00Z")).toEqual({ phase: "countdown", minutesLeft: 59 }); // 01:31
  });
  it("warns from 02:00 and closes at 02:30 until 09:00", () => {
    expect(at("2026-09-19T23:00:00Z")).toEqual({ phase: "notice", minutesLeft: 30 }); // 02:00
    expect(at("2026-09-19T23:29:00Z")).toEqual({ phase: "notice", minutesLeft: 1 }); // 02:29
    expect(at("2026-09-19T23:30:00Z")).toEqual({ phase: "closed", minutesLeft: 0 }); // 02:30
    expect(at("2026-09-20T05:59:00Z").phase).toBe("closed"); // 08:59
  });
  /** المنيو كان يُغلق بعد ساعةٍ من ذروة الواحدة فجراً — فمُدّ نصف ساعة */
  it("keeps the section open through 02:00–02:29, which the old rule shut", () => {
    expect(at("2026-09-19T23:15:00Z").phase).not.toBe("closed"); // 02:15
  });
  it("prints the closing hour from the constants, never by hand", () => {
    expect(lateCloseLabel()).toBe("02:30");
  });
});
