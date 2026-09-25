import { describe, expect, it } from "vitest";
import { baghdadNow, closedOrderText, closedText, hourAr, hoursLine, nextOpening, withinHours } from "./hours";

/** لحظةٌ ببغداد: الوسيطة UTC، وبغداد +٣ بلا توقيت صيفي */
const bg = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+03:00`);
// 2026-09-25 جمعة · 26 سبت · 27 أحد
const FRI = "2026-09-25";
const SAT = "2026-09-26";

describe("ساعة بغداد", () => {
  it("تُقرأ من بغداد لا من ساعة الجهاز", () => {
    expect(baghdadNow(bg(FRI, "13:30"))).toEqual({ day: 5, minutes: 13 * 60 + 30 });
    expect(baghdadNow(bg(SAT, "00:10"))).toEqual({ day: 6, minutes: 10 });
  });
});

describe("صياغة الساعة", () => {
  it("كما يقولها الناس", () => {
    expect(hourAr(9)).toBe("٩ الصبح");
    expect(hourAr(13)).toBe("١ الظهر");
    expect(hourAr(3)).toBe("٣ الفجر");
  });
});

describe("داخل الدوام", () => {
  it("ما قبل الثالثة فجراً يتبع دوام أمس فيُعدّ ضمنه", () => {
    expect(withinHours(bg(SAT, "01:30"))).toBe(true);
    expect(withinHours(bg(SAT, "02:59"))).toBe(true);
  });

  it("وبين الثالثة والافتتاح خارجه", () => {
    expect(withinHours(bg(SAT, "03:30"))).toBe(false);
    expect(withinHours(bg(SAT, "08:59"))).toBe(false);
    expect(withinHours(bg(SAT, "09:00"))).toBe(true);
  });

  /** الجمعة تفتح ١ ظهراً بطلب المالك — والعاشرة صباحاً فيها مغلقة */
  it("والجمعة لا تفتح إلا ١ ظهراً", () => {
    expect(withinHours(bg(FRI, "10:00"))).toBe(false);
    expect(withinHours(bg(FRI, "12:59"))).toBe(false);
    expect(withinHours(bg(FRI, "13:00"))).toBe(true);
  });
});

describe("متى نفتح", () => {
  it("اليوم إن لم نفتح بعد", () => {
    expect(nextOpening(bg(SAT, "06:00"))).toMatchObject({ today: true, hour: 9 });
    expect(nextOpening(bg(FRI, "10:00"))).toMatchObject({ today: true, hour: 13 });
  });

  it("وباچر إن فات افتتاح اليوم — وتُسمّى باسمها", () => {
    const n = nextOpening(bg(FRI, "23:00"));
    expect(n.today).toBe(false);
    expect(n.hour).toBe(9);
    expect(n.dayName).toBe("السبت");
  });

  it("وليلة الخميس تدلّ على الجمعة بساعتها لا بساعة غيرها", () => {
    const n = nextOpening(bg("2026-09-24", "23:30"));
    expect(n.dayName).toBe("الجمعة");
    expect(n.hour).toBe(13);
  });
});

describe("رسالة الإغلاق", () => {
  it("خارج الدوام تَعِد بساعةٍ محدّدة", () => {
    const t = closedText("07831551888", bg(SAT, "06:00"));
    expect(t).toContain("اليوم");
    expect(t).toContain("٩ الصبح");
  });

  /** وهذا هو المكسب: من يراسلنا الجمعة صباحاً كان يُقال له «٩ الصبح» ويجي */
  it("وصباح الجمعة تقول ١ الظهر لا ٩ الصبح", () => {
    const t = closedText("07831551888", bg(FRI, "10:00"));
    expect(t).toContain("١ الظهر");
    expect(t).not.toContain("٩ الصبح");
  });

  /**
   * مغلقٌ والساعة تقول مفتوح: أُقفل الدرج مبكّراً أو تأخّر فتحه. ووعدُ ساعةٍ
   * هنا كذب — الجدول لا يعرف متى يعود الكاشير.
   */
  it("وداخل الدوام لا تَعِد بساعة بل تعطي الهاتف", () => {
    const t = closedText("07831551888", bg(SAT, "20:00"));
    expect(t).toContain("07831551888");
    expect(t).not.toContain("نفتح");
  });

  it("ومن كتب طلباً يُقال له صراحةً إنه لم يُحفظ", () => {
    for (const t of [closedOrderText("07831551888", bg(SAT, "06:00")), closedOrderText("07831551888", bg(SAT, "20:00"))]) {
      expect(t).toContain("ما ينحفظ");
    }
  });

  it("ولا حرف «گ» في شيء منها — الخطّ لا يحمله", () => {
    for (const t of [
      closedText("07831551888", bg(SAT, "06:00")),
      closedText("07831551888", bg(SAT, "20:00")),
      closedOrderText("07831551888", bg(FRI, "10:00")),
      hoursLine(),
    ]) {
      expect(t).not.toContain("گ");
    }
  });
});

describe("سطر الدوام الساكن", () => {
  it("يذكر استثناء الجمعة ويشتقّه من الجدول", () => {
    expect(hoursLine()).toBe("كل يوم من ٩ الصبح حتى ٣ الفجر، والجمعة من ١ الظهر");
  });
});
