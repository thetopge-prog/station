import { describe, expect, it } from "vitest";
import { REVIEW_URL, reviewDelayMs, reviewDue, reviewMessage } from "./review-ask";

describe("توقيت طلب التقييم", () => {
  it("التوصيل ينتظر ضعف غيره — handed_at فيه تسليمٌ للسائق لا للزبون", () => {
    expect(reviewDelayMs("delivery")).toBe(30 * 60_000);
    expect(reviewDelayMs("pickup")).toBe(15 * 60_000);
    expect(reviewDelayMs("curbside")).toBe(15 * 60_000);
    expect(reviewDelayMs(null)).toBe(15 * 60_000);
  });

  it("لا يحين قبل موعده ولا يفوت بعده", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    const handed = (min: number) => new Date(now - min * 60_000).toISOString();
    expect(reviewDue(handed(14), "pickup", now)).toBe(false);
    expect(reviewDue(handed(16), "pickup", now)).toBe(true);
    expect(reviewDue(handed(16), "delivery", now)).toBe(false);
    expect(reviewDue(handed(31), "delivery", now)).toBe(true);
  });

  it("طلبٌ لم يُسلَّم بعد لا يُسأل صاحبه", () => {
    expect(reviewDue(null, "pickup")).toBe(false);
  });
});

describe("نصّ طلب التقييم", () => {
  it("ينادي بالاسم حين يوجد", () => {
    expect(reviewMessage({ name: "أحمد" })).toContain("هلا أحمد");
  });

  it("وبلا اسمٍ يبدأ بتحيّةٍ تامّة لا بفراغ", () => {
    const t = reviewMessage({ name: null });
    expect(t).toContain("هلا بيك");
    expect(t).not.toContain("هلا \n");
  });

  it("يذكر الصنف المتكرّر بالاسم", () => {
    const t = reviewMessage({ name: "علي", focus: "كنتاكي" });
    expect(t).toContain("كنتاكي");
    expect(t).toContain("ثلاث مرّات");
  });

  it("يحمل الرابط دائماً", () => {
    expect(reviewMessage({})).toContain(REVIEW_URL);
    expect(reviewMessage({ focus: "بيتزا" })).toContain(REVIEW_URL);
  });

  /**
   * الخطّ لا يحمل «گ»، فيستعيره المتصفّح من خطٍّ آخر ويخرج الحرف غريباً عن
   * أخواته — وقد رآه المالك على هاتفه وشكا منه. هذا حارسه.
   */
  it("لا حرف «گ» في أي صيغة من صيغ الرسالة", () => {
    for (const t of [
      reviewMessage({}),
      reviewMessage({ name: "سارة" }),
      reviewMessage({ name: "سارة", focus: "كنتاكي" }),
    ]) {
      expect(t).not.toContain("گ");
    }
  });
});
