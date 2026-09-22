import { describe, expect, it } from "vitest";
import { rateStart, rateStep, type RateState } from "../../../supabase/functions/telegram-bot/rating-flow";
import { savedOrderLabel, savedOrderToLines } from "../../../supabase/functions/telegram-bot/reorder";
import type { Menu } from "../../../supabase/functions/telegram-bot/order-flow";

describe("rating flow — four steps, average, save threshold", () => {
  const walk = (answers: (number | string)[]) => {
    let { state } = rateStart("o1", 42);
    let reply = rateStart("o1", 42).reply;
    for (const a of answers) {
      const out = rateStep(state, typeof a === "number" ? { kind: "score", value: a } : { kind: "text", text: a });
      state = out.state;
      reply = out.reply;
    }
    return { state, reply };
  };

  it("asks food → service → ordering → advice, then finishes with the average", () => {
    const { state, reply } = walk([9, 9, 9, "-"]);
    expect(state.step).toBe("done");
    expect(reply.done).toEqual({ score: 9, save: true, advice: null });
    expect(reply.text).toContain("طلباتي السابقة");
  });

  it("does not save at exactly 8, keeps the advice text", () => {
    const { reply } = walk([8, 8, 8, "زيدوا الصوص"]);
    expect(reply.done).toEqual({ score: 8, save: false, advice: "زيدوا الصوص" });
  });

  it("accepts a typed Arabic digit and rejects out-of-range", () => {
    const s0: RateState = rateStart("o1", 1).state;
    expect(rateStep(s0, { kind: "text", text: "٧" }).state.food).toBe(7);
    const bad = rateStep(s0, { kind: "score", value: 11 });
    expect(bad.state.step).toBe("food");
    expect(bad.reply.scale).toBe(true);
  });
});

describe("reorder — saved order to cart lines", () => {
  const MENU: Menu = {
    categories: [{ id: "c", name: "زنجر" }],
    items: [
      { id: "z", categoryId: "c", name: "زنجر بوفالو", price: 5000, sizes: [{ id: "zs", name: "ساندويچ", price: 5000 }, { id: "zm", name: "وجبة", price: 7500 }], doughs: [] },
      { id: "p", categoryId: "c", name: "ببسي", price: 1000, sizes: [], doughs: [] },
    ],
  };
  const order = {
    id: "o", order_seq: 7, subtotal: 16000, created_at: "2026-09-20T00:00:00Z",
    items: [
      { item_id: "z", variant_id: "zm", name_ar: "زنجر بوفالو - وجبة", flavor_ar: null, qty: 2, note: "بلا بصل" },
      { item_id: "p", variant_id: null, name_ar: "ببسي", flavor_ar: null, qty: 1, note: null },
      { item_id: "gone", variant_id: null, name_ar: "صنف محذوف", flavor_ar: null, qty: 1, note: null },
    ],
  };
  it("prices from today's menu, drops items that no longer exist", () => {
    const lines = savedOrderToLines(order, MENU);
    expect(lines.map((l) => `${l.qty}×${l.name}/${l.sizeName}@${l.unitPrice}`)).toEqual(["2×زنجر بوفالو/وجبة@7500", "1×ببسي/null@1000"]);
    expect(lines[0].note).toBe("بلا بصل");
  });
  it("labels the order compactly", () => {
    expect(savedOrderLabel(order)).toBe("زنجر بوفالو - وجبة ×2 + ببسي + صنف محذوف — 16,000 د.ع");
  });
});
