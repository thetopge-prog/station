import { describe, expect, it } from "vitest";
import { openedText } from "./waitlist";

/**
 * الرسالة التي تصل من راسلنا ونحن مغلقون، أوّل ما نفتح.
 *
 * `flushWaiting` تحتاج قاعدة، فالمُختبَر هنا هو النصّ — وهو ما يقرؤه الزبون.
 * والصياغة كتبها المالك بيده، فالاختبار يحرسها حرفاً بحرف: تعديلها لاحقاً
 * بحسن نيّة يكسر اختباراً بدل أن يمرّ بصمت.
 */
describe("رسالة «إحنا هسة موجودين»", () => {
  it("بصياغة المالك سطراً بسطر", () => {
    expect(openedText("أحمد")).toBe(
      [
        "هلا أحمد 🌟",
        "راسلتنا والمطعم جان مسدود — وما نسيناك 🧡",
        "",
        "إحنا هسة موجودين ونستقبل طلباتكم بكل حب.",
        "المطبخ اشتغل، وبلشنا نستقبل الطلبات.",
        "",
        "تحب تطلب شيء؟ اكتبلي أو اختار من المنيو جوة 👇",
      ].join("\n"),
    );
  });

  it("وبلا اسمٍ تبدأ بتحيّةٍ تامّة لا بفراغ", () => {
    const t = openedText(null);
    expect(t).toContain("هلا بيك 🌟");
    expect(t).not.toMatch(/هلا\s*\n/);
  });

  it("تقول له إنه لم يُنسَ — وهو معنى الرسالة كلّه", () => {
    expect(openedText(null)).toContain("ما نسيناك");
  });

  it("وتنتهي بسؤال لا بخبر", () => {
    expect(openedText(null).trimEnd().endsWith("👇")).toBe(true);
    expect(openedText(null)).toContain("تحب تطلب شيء؟");
  });

  /** «جوة» تعني الزرّ تحتها — فلا رابط عارٍ في النصّ يسبقه */
  it("ولا رابط في النصّ — الزرّ جوة", () => {
    expect(openedText("علي")).not.toContain("http");
    expect(openedText("علي")).not.toContain("/menu");
  });

  /** الخطّ لا يحمل «گ» — نفس حارس بقيّة النصوص */
  it("ولا حرف «گ» فيها", () => {
    for (const t of [openedText(null), openedText("علي")]) expect(t).not.toContain("گ");
  });
});
