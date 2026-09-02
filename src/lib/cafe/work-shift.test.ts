import { describe, expect, it } from "vitest";
import { inShift, shiftAt, shiftDeniedMessage, workDay } from "./work-shift";
import { businessDay } from "./time";

/** لحظة بتوقيت بغداد (UTC+3) — بغداد لا تطبّق التوقيت الصيفي. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, 2, h - 3, m));
};

describe("inShift", () => {
  it("lets the shared accounts work at any hour — they have no shift", () => {
    // كاشير=1 · مجهّز=2 · إدارة=3 يتناوب عليها أشخاص، فلا وردية لها
    for (const t of ["00:30", "07:00", "13:00", "23:59"]) {
      expect(inShift(null, at(t)), t).toBe(true);
    }
  });

  it("holds the morning shift open 09:00–15:00", () => {
    expect(inShift("morning", at("09:00"))).toBe(true);
    expect(inShift("morning", at("12:30"))).toBe(true);
    expect(inShift("morning", at("15:00"))).toBe(true);
  });

  it("keeps the morning cashier working through the handover", () => {
    // ٣:٠١ والمسائي لم يصل — هذا بالضبط ما تمنع المهلة حدوثه
    expect(inShift("morning", at("15:30"))).toBe(true);
    expect(inShift("morning", at("16:00"))).toBe(true);
    expect(inShift("morning", at("08:00"))).toBe(true);
  });

  it("shuts the morning shift outside its window plus grace", () => {
    expect(inShift("morning", at("07:00"))).toBe(false);
    expect(inShift("morning", at("16:30"))).toBe(false);
    expect(inShift("morning", at("21:00"))).toBe(false);
    expect(inShift("morning", at("01:00"))).toBe(false);
  });

  it("carries the evening shift ACROSS midnight — the whole difficulty", () => {
    expect(inShift("evening", at("15:00"))).toBe(true);
    expect(inShift("evening", at("23:59"))).toBe(true);
    expect(inShift("evening", at("00:30"))).toBe(true);
    expect(inShift("evening", at("02:59"))).toBe(true);
    expect(inShift("evening", at("03:30"))).toBe(true); // بالمهلة
  });

  it("shuts the evening shift in the morning, not merely 'later'", () => {
    expect(inShift("evening", at("05:00"))).toBe(false);
    expect(inShift("evening", at("10:00"))).toBe(false);
    expect(inShift("evening", at("13:30"))).toBe(false);
    expect(inShift("evening", at("14:00"))).toBe(true); // المهلة تبدأ
  });

  it("never leaves an hour of the day with no one allowed", () => {
    // لو وُجدت ساعة يُمنع فيها الصباحي والمسائي معاً لتوقّف المحل فيها
    for (let h = 9; h < 27; h++) {
      const t = at(`${String(h % 24).padStart(2, "0")}:30`);
      expect(inShift("morning", t) || inShift("evening", t), `${h % 24}:30`).toBe(true);
    }
  });

  it("respects a zero grace when asked, for reporting «worked outside shift»", () => {
    expect(inShift("morning", at("15:30"), 0)).toBe(false);
    expect(inShift("morning", at("15:30"))).toBe(true);
  });
});

describe("shiftAt", () => {
  it("names the shift a moment falls in", () => {
    expect(shiftAt(at("10:00"))).toBe("morning");
    expect(shiftAt(at("20:00"))).toBe("evening");
    expect(shiftAt(at("01:00"))).toBe("evening");
  });

  it("returns null in the closed hours", () => {
    expect(shiftAt(at("05:00"))).toBeNull();
  });
});

describe("shiftDeniedMessage", () => {
  it("tells the person when to come back, not merely that they are refused", () => {
    expect(shiftDeniedMessage("morning")).toContain("09:00");
    expect(shiftDeniedMessage("morning")).toContain("15:00");
    expect(shiftDeniedMessage("evening")).toContain("03:00");
  });
});

describe("workDay", () => {
  it("keeps a whole evening shift on ONE day across midnight", () => {
    // ٣ع اليوم و ٢ص من الغد وردية واحدة — ويجب أن تحمل يوم دوام واحداً
    expect(workDay(at("15:00"))).toBe("2026-09-02");
    expect(workDay(at("23:59"))).toBe("2026-09-02");
    const twoAm = new Date(Date.UTC(2026, 8, 2, 23, 0)); // ٠٢:٠٠ بغداد يوم ٣
    expect(workDay(twoAm)).toBe("2026-09-02");
  });

  it("rolls over once the shift is truly finished", () => {
    const fiveAm = new Date(Date.UTC(2026, 8, 3, 2, 0)); // ٠٥:٠٠ بغداد يوم ٣
    expect(workDay(fiveAm)).toBe("2026-09-03");
  });

  it("is not business_day — that is the whole reason it exists", () => {
    const oneAm = new Date(Date.UTC(2026, 8, 2, 22, 0)); // ٠١:٠٠ بغداد يوم ٣
    expect(businessDay(oneAm)).toBe("2026-09-03");
    expect(workDay(oneAm)).toBe("2026-09-02");
  });
});
