import { describe, expect, it } from "vitest";
import { START, cartTotal, normalizeIraqiPhone, step, type Input, type Menu, type State } from "../../../supabase/functions/telegram-bot/order-flow";

/**
 * محرّك الطلب بلا تليغرام: الحوار كله كأزرار ونصوص، والمنيو وسيط.
 * الاختبار يمشي المسار الذي سيمشيه الزبون الليلة، بالترتيب.
 */
const MENU: Menu = {
  categories: [
    { id: "c-pizza", name: "بيتزا" },
    { id: "c-fries", name: "فرايز" },
    { id: "c-empty", name: "فارغ" },
  ],
  items: [
    { id: "i-sup", categoryId: "c-pizza", name: "بيتزا سوبريم", price: 12000, sizes: [{ id: "s-m", name: "وسط", price: 12000 }, { id: "s-l", name: "كبير", price: 17000 }], doughs: ["خفيف", "سميك"] },
    { id: "i-wed", categoryId: "c-fries", name: "الويدجز", price: 2500, sizes: [], doughs: [] },
  ],
};

const btn = (data: string): Input => ({ kind: "button", data });
const txt = (text: string): Input => ({ kind: "text", text });

/** يمشي سلسلة مدخلات ويعيد آخر حالة وردّ */
function walk(inputs: Input[], from: State | null = null, known?: { address?: string | null; name?: string | null }) {
  let state = from;
  let reply = step(state, txt("/start"), MENU, known).reply;
  for (const i of inputs) {
    const out = step(state, i, MENU, known);
    state = out.state;
    reply = out.reply;
  }
  return { state: state!, reply };
}

describe("order flow", () => {
  it("starts on /start and hides empty categories", () => {
    const { reply } = walk([txt("/start"), btn("o|cats")]);
    const labels = reply.buttons!.flat().map((b) => b.text);
    expect(labels).toContain("بيتزا");
    expect(labels).toContain("فرايز");
    expect(labels).not.toContain("فارغ");
  });

  it("opens a pizza with the first size and dough preselected, and prices by size", () => {
    const { state, reply } = walk([btn("o|cat|c-pizza"), btn("o|item|i-sup")]);
    expect(state.draft).toMatchObject({ itemId: "i-sup", sizeId: "s-m", dough: "خفيف", qty: 1 });
    expect(reply.buttons!.flat().some((b) => b.text.includes("✅ وسط"))).toBe(true);
    const large = walk([btn("o|cat|c-pizza"), btn("o|item|i-sup"), btn("o|size|s-l"), btn("o|qty|+")], null);
    expect(large.reply.buttons!.flat().some((b) => b.text.includes("34,000"))).toBe(true);
  });

  it("takes a note as the next text, then adds the line to the cart", () => {
    const { state } = walk([btn("o|cat|c-pizza"), btn("o|item|i-sup"), btn("o|dough|سميك"), btn("o|qty|+"), btn("o|note"), txt("بلا بصل"), btn("o|add")]);
    expect(state.step).toBe("cart");
    expect(state.cart).toHaveLength(1);
    expect(state.cart[0]).toMatchObject({ itemId: "i-sup", sizeName: "وسط", dough: "سميك", qty: 2, unitPrice: 12000, note: "بلا بصل" });
    expect(cartTotal(state.cart)).toBe(24000);
  });

  it("removes a line by index", () => {
    const { state } = walk([btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|cat|c-pizza"), btn("o|item|i-sup"), btn("o|add"), btn("o|rm|0")]);
    expect(state.cart.map((l) => l.itemId)).toEqual(["i-sup"]);
  });

  it("pickup: channel → phone → confirm, no address asked", () => {
    const { state, reply } = walk([btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|checkout"), btn("o|ch|pickup"), { kind: "contact", phone: "+964 770 123 4567" }]);
    expect(state.step).toBe("confirm");
    expect(state.phone).toBe("07701234567");
    expect(reply.text).toContain("استلام من المحل");
  });

  it("delivery: asks the address, offers the known one as a button, and typed text works too", () => {
    const base = [btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|checkout"), btn("o|ch|delivery"), txt("07701234567")];
    const known = walk(base, null, { address: "الرمادي — حي التأميم", name: "أبو علي" });
    expect(known.state.step).toBe("address");
    expect(known.reply.buttons!.flat().some((b) => b.data === "o|addr|same")).toBe(true);
    const same = step(known.state, btn("o|addr|same"), MENU, { address: "الرمادي — حي التأميم" });
    expect(same.state.step).toBe("confirm");
    expect(same.state.address).toBe("الرمادي — حي التأميم");
    expect(same.state.name).toBe("أبو علي");

    const typed = walk([...base, txt("حي الضباط، قرب الجامع")]);
    expect(typed.state.step).toBe("confirm");
    expect(typed.state.address).toBe("حي الضباط، قرب الجامع");
  });

  it("rejects a non-Iraqi phone and asks again", () => {
    const { state, reply } = walk([btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|checkout"), btn("o|ch|pickup"), txt("12345")]);
    expect(state.step).toBe("phone");
    expect(reply.requestContact).toBe(true);
  });

  it("send builds the intake payload — variant by size name, flavor by dough, notes folded into the order note — and resets", () => {
    const { state, reply } = walk([
      btn("o|cat|c-pizza"), btn("o|item|i-sup"), btn("o|size|s-l"), btn("o|dough|سميك"), btn("o|note"), txt("بلا بصل"), btn("o|add"),
      btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|qty|+"), btn("o|add"),
      btn("o|checkout"), btn("o|ch|delivery"), txt("٠٧٧٠١٢٣٤٥٦٧"), txt("حي الضباط"), btn("o|send"),
    ]);
    expect(reply.order).toEqual({
      channel: "delivery",
      customer_name: null,
      phone: "07701234567",
      address: "حي الضباط",
      note: "بيتزا سوبريم · كبير · سميك ×1: بلا بصل",
      lines: [
        { item_id: "i-sup", variant: "كبير", flavor: "سميك", qty: 1 },
        { item_id: "i-wed", variant: null, flavor: null, qty: 2 },
      ],
    });
    expect(state).toEqual(START);
  });

  it("voice is acknowledged, not silently dropped — and the cart survives it", () => {
    const { state, reply } = walk([btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), { kind: "voice" }]);
    expect(reply.text).toContain("الصوت");
    expect(state.cart).toHaveLength(1);
  });

  it("never exposes a callback longer than Telegram's 64 bytes", () => {
    const { reply } = walk([btn("o|cat|c-pizza"), btn("o|item|i-sup")]);
    for (const b of reply.buttons!.flat()) expect(new TextEncoder().encode(b.data).length).toBeLessThanOrEqual(64);
  });
});

describe("normalizeIraqiPhone", () => {
  it("folds every shape into the local one, and rejects the rest", () => {
    expect(normalizeIraqiPhone("+9647701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("009647701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("07701234567")).toBe("07701234567");
    expect(normalizeIraqiPhone("٠٧٧٠١٢٣٤٥٦٧")).toBe("07701234567");
    expect(normalizeIraqiPhone("1234")).toBeNull();
  });
});
