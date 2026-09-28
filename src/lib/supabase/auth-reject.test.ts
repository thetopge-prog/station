import { describe, expect, it } from "vitest";
import { isAuthRejection } from "./server";

/**
 * «انتهت جلستك» و«الشبكة تعثّرت» كانا يُقرآن سواءً، فيُطرد موظّفٌ رمزُه سليم
 * لأن طلباً واحداً تأخّر. والرفض وحده يحمل رمز حالة.
 */
describe("تمييز الرفض من عثرة الشبكة", () => {
  it("٤٠١ و٤٠٣ رفضٌ للجلسة", () => {
    expect(isAuthRejection({ status: 401 })).toBe(true);
    expect(isAuthRejection({ status: 403 })).toBe(true);
  });

  it("وخطأ الخادم ليس رفضاً — الجلسة سليمة والخادم هو المتعثّر", () => {
    expect(isAuthRejection({ status: 500 })).toBe(false);
    expect(isAuthRejection({ status: 502 })).toBe(false);
    expect(isAuthRejection({ status: 504 })).toBe(false);
  });

  it("وانقطاعٌ بلا رمز حالة ليس رفضاً — وهذا هو الفرق كلّه", () => {
    expect(isAuthRejection({})).toBe(false);
    expect(isAuthRejection(null)).toBe(false);
    expect(isAuthRejection(undefined)).toBe(false);
  });

  it("و٤٢٩ ليست رفضاً للجلسة بل ازدحاماً يُعاد بعده", () => {
    expect(isAuthRejection({ status: 429 })).toBe(false);
  });
});
