import { describe, expect, it } from "vitest";
import { openedText } from "./waitlist";

/**
 * الرسالة التي تصل من راسلنا ونحن مغلقون، أوّل ما نفتح.
 *
 * `flushWaiting` تحتاج قاعدة، فالمُختبَر هنا هو النصّ — وهو ما يقرؤه الزبون.
 */
describe("رسالة «إحنا هسة موجودين»", () => {
  it("تحمل العبارة التي طلبها المالك", () => {
    expect(openedText("أحمد")).toContain("إحنا هسة موجودين ونستقبل طلباتكم بكل حب");
  });

  it("تنادي بالاسم حين يوجد", () => {
    expect(openedText("أحمد")).toContain("هلا أحمد");
  });

  it("وبلا اسمٍ تبدأ بتحيّةٍ تامّة لا بفراغ", () => {
    const t = openedText(null);
    expect(t).toContain("هلا بيك");
    expect(t).not.toMatch(/هلا\s*\n/);
  });

  it("تقول له إنه لم يُنسَ — وهو معنى الرسالة كلّه", () => {
    expect(openedText(null)).toContain("ما نسيناك");
  });

  it("وتنتهي بفعل: رابط المنيو ورقم الهاتف", () => {
    const t = openedText("سارة", "9647812345678");
    expect(t).toContain("/menu?mode=delivery");
    expect(t).toContain("07812345678");
  });

  it("ورقمٌ غير عراقي لا يُلصق بالرابط", () => {
    expect(openedText(null, "905321234567")).not.toContain("phone=");
  });

  /** الخطّ لا يحمل «گ» — نفس حارس بقيّة النصوص */
  it("ولا حرف «گ» فيها", () => {
    for (const t of [openedText(null), openedText("علي"), openedText("علي", "9647812345678")]) {
      expect(t).not.toContain("گ");
    }
  });
});
