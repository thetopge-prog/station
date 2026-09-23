import { describe, expect, it } from "vitest";
import { vocabHint } from "../../../supabase/functions/telegram-bot/llm";
import type { Menu } from "../../../supabase/functions/telegram-bot/order-flow";

/**
 * Groq ردّ 400 على منيو ستيشن الحقيقي — ١٧٤٩ حرفاً مقابل سقفٍ ٨٩٦ — فسقط
 * تفريغ كل رسالةٍ صوتية. الاختبار على السقف نفسه، لا على أن الدالّة تعمل.
 */
const menu = (n: number): Menu => ({
  categories: [{ id: "c", name: "قسم" }],
  items: Array.from({ length: n }, (_, i) => ({
    id: `i${i}`,
    categoryId: "c",
    name: `صنفٌ طويلُ الاسم رقم ${i}`,
    price: 1000,
    sizes: [],
    doughs: [],
  })),
});

describe("vocabHint", () => {
  it("لا يتجاوز سقف Groq مهما طال المنيو", () => {
    for (const n of [1, 20, 79, 300]) {
      expect(vocabHint(menu(n)).length, `${n} صنفاً`).toBeLessThanOrEqual(896);
    }
  });

  it("يقصّ عند فاصلة، فلا ينتهي باسمٍ نصفه", () => {
    const h = vocabHint(menu(300));
    expect(h).toContain("طلب من مطعم ستيشن:");
    expect(h.endsWith(". وجبة، ساندويچ، بدون بصل، توصيل.")).toBe(true);
  });

  it("المنيو الصغير يمرّ كاملاً", () => {
    expect(vocabHint(menu(3))).toContain("صنفٌ طويلُ الاسم رقم 2");
  });
});
