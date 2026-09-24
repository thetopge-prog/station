import { describe, expect, it } from "vitest";
import { START, cartTotal, extractWhen, normalizeIraqiPhone, step, understand, type Input, type Menu, type State } from "../../../supabase/functions/telegram-bot/order-flow";

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

  it("pickup: channel → phone → name → confirm, no address asked", () => {
    const { state, reply } = walk(
      [btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|checkout"), btn("o|ch|pickup"), { kind: "contact", phone: "+964 770 123 4567" }],
      null,
      { name: "سيف" },
    );
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

    const typed = walk([...base, txt("أبو علي"), txt("حي الضباط، قرب الجامع")]);
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
      btn("o|checkout"), btn("o|ch|delivery"), txt("٠٧٧٠١٢٣٤٥٦٧"), txt("أبو علي"), txt("حي الضباط"), btn("o|send"),
    ]);
    expect(reply.order).toEqual({
      channel: "delivery",
      customer_name: "أبو علي",
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

describe("understand — free text to cart, no LLM", () => {
  const SHOP: Menu = {
    categories: [{ id: "c1", name: "زنجر" }, { id: "c2", name: "بيتزا" }, { id: "c3", name: "مشروبات" }],
    items: [
      { id: "z1", categoryId: "c1", name: "كلاسيك زنجر", price: 5000, sizes: [{ id: "z1s", name: "ساندويچ", price: 5000 }, { id: "z1m", name: "وجبة", price: 7000 }], doughs: [] },
      { id: "z2", categoryId: "c1", name: "زنجر بوفالو", price: 5000, sizes: [{ id: "z2s", name: "ساندويچ", price: 5000 }, { id: "z2m", name: "وجبة", price: 7000 }], doughs: [] },
      { id: "p1", categoryId: "c2", name: "بيتزا سوبريم", price: 12000, sizes: [{ id: "pm", name: "وسط", price: 12000 }, { id: "pl", name: "كبير", price: 17000 }], doughs: [] },
      { id: "d1", categoryId: "c3", name: "ببسي", price: 1000, sizes: [], doughs: [] },
    ],
  };
  const names = (t: string) => (understand(t, SHOP) ?? []).map((l) => `${l.qty}×${l.name}${l.sizeName ? `/${l.sizeName}` : ""}${l.note ? ` (${l.note})` : ""}`);

  it("reads quantity, item, size and a note from one line", () => {
    expect(names("٢ زنجر بوفالو وجبة بدون بصل")).toEqual(["2×زنجر بوفالو/وجبة (بدون بصل)"]);
  });
  it("splits on «و» / «،» and understands number words and the Arabic ة/ي shapes", () => {
    expect(names("اريد اثنين زنجر بافلو و بيتزا سوبريم كبيرة، ثلاث بيبسي")).toEqual(["2×زنجر بوفالو/ساندويچ", "1×بيتزا سوبريم/كبير", "3×ببسي"]);
  });
  it("prefers the item whose whole name matched, and defaults to the first size", () => {
    expect(names("كلاسيك زنجر")).toEqual(["1×كلاسيك زنجر/ساندويچ"]);
    expect(names("زنجر ×2")).toEqual(["2×كلاسيك زنجر/ساندويچ"]);
  });
  it("returns null for a question or a greeting — that goes to a human", () => {
    expect(understand("هل عندكم توصيل للتأميم؟", SHOP)).toBeNull();
    expect(understand("مرحبا", SHOP)).toBeNull();
    expect(understand("وين المحل", SHOP)).toBeNull();
  });

  // ما وقع فعلاً في محادثات واتساب — كل حالة كلّفت طلباً خاطئاً
  it("«واثنين» is a second order, not an adjective — the burger used to arrive as one", () => {
    expect(names("تريد واحد بيتزا سوبريم وسط واثنين زنجر بوفالو")).toEqual(["1×بيتزا سوبريم/وسط", "2×زنجر بوفالو/ساندويچ"]);
  });

  it("the spellings customers actually type: «بيزة» is a pizza, «برقر» is a burger", () => {
    expect(names("بيزه سوبريم وسط")).toEqual(["1×بيتزا سوبريم/وسط"]);
    expect(names("زنكر بوفالو")).toEqual(["1×زنجر بوفالو/ساندويچ"]);
  });


  it("a clock time is not a quantity: «الساعة 11» once cost 11 pizzas instead of 4", () => {
    expect(names("اريد أربعة بيتزا سوبريم وسط الساعة 11 تكون جاهزة")).toEqual(["4×بيتزا سوبريم/وسط"]);
    expect(extractWhen("اريد أربعة بيتزا الساعة 11 تكون جاهزة").when).toContain("11");
  });

  it("keeps other clock shapes out of the count too", () => {
    expect(names("بيتزا سوبريم كبيرة 9:30")).toEqual(["1×بيتزا سوبريم/كبير"]);
    expect(extractWhen("خليها بعد نص ساعة").when).toBe("بعد نص ساعة");
    expect(extractWhen("٣ ببسي").when).toBeNull();
  });

  it("reads the Ramadi spelling of a size — «جبير» is كبير, not the cheapest", () => {
    expect(names("بيبسي حجم جبير")).toEqual(["1×ببسي"]);
    expect(names("بيتزا سوبريم جبيرة")).toEqual(["1×بيتزا سوبريم/كبير"]);
    expect(names("بيتزا سوبريم متوسط")).toEqual(["1×بيتزا سوبريم/وسط"]);
  });

  it("the requested time travels to the kitchen note", () => {
    const st = step({ ...START }, { kind: "text", text: "بيتزا سوبريم وسط الساعة 11" }, SHOP).state;
    expect(st.when).toContain("11");
    expect(st.cart).toHaveLength(1);
  });
});

describe("dough is read from the message, not assumed", () => {
  const PIZZA: Menu = {
    categories: [{ id: "c", name: "بيتزا" }],
    items: [{ id: "p", categoryId: "c", name: "بيتزا سوبريم", price: 12000, sizes: [{ id: "m", name: "وسط", price: 12000 }], doughs: ["كلاسيك", "عجينة سميكة"] }],
  };
  it("picks the crust the customer named", () => {
    expect(understand("بيتزا سوبريم وسط سميكة", PIZZA)![0].dough).toBe("عجينة سميكة");
  });
  it("falls back to the first crust when none is named", () => {
    expect(understand("بيتزا سوبريم وسط", PIZZA)![0].dough).toBe("كلاسيك");
  });
});

describe("default size is the cheapest, not the first row", () => {
  // في القاعدة خمسة أصناف حجماها بترتيب واحد فكان أوّلها «وجبة» — والزبون يدفع الفرق
  const BURGER: Menu = {
    categories: [{ id: "c", name: "برجر" }],
    items: [{ id: "b", categoryId: "c", name: "بركر دجاج بالجبن", price: 4750, sizes: [{ id: "meal", name: "وجبة", price: 6750 }, { id: "sand", name: "ساندويچ", price: 4750 }], doughs: [] }],
  };
  it("«بركر دجاج بالجبن» alone is a sandwich", () => {
    const l = understand("بركر دجاج بالجبن", BURGER)![0];
    expect([l.sizeName, l.unitPrice]).toEqual(["ساندويچ", 4750]);
  });
  it("«وجبة» in the message still wins", () => {
    const l = understand("بركر دجاج بالجبن وجبة", BURGER)![0];
    expect([l.sizeName, l.unitPrice]).toEqual(["وجبة", 6750]);
  });
});

/**
 * الاسم مع الرقم صار قاعدةً في النظام كلّه، والخادم يرفض الطلب بدونه. فالبوت
 * يجب أن يسأله — وإلا ارتدّ طلبُ الزبون برسالة تقنية لا يفهمها.
 */
describe("الاسم مطلوب مع الرقم", () => {
  const toPhone = [btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|checkout"), btn("o|ch|pickup")];

  it("يسأل عن الاسم بعد الرقم حين لا يعرفه", () => {
    const { state, reply } = walk([...toPhone, txt("07801234567")]);
    expect(state.step).toBe("name");
    expect(reply.text).toContain("شنو اسمك");
  });

  it("يقبل الاسم ثم يعرض التأكيد وفيه الاسم", () => {
    const { state, reply } = walk([...toPhone, txt("07801234567"), txt("أبو علي")]);
    expect(state.step).toBe("confirm");
    expect(state.name).toBe("أبو علي");
    expect(reply.text).toContain("أبو علي");
  });

  it("لا يقبل حرفاً واحداً اسماً", () => {
    const { state } = walk([...toPhone, txt("07801234567"), txt("ا")]);
    expect(state.step).toBe("name");
  });

  it("لا يسأل من عرّفنا باسمه من قبل", () => {
    const { state } = walk([...toPhone, txt("07801234567")], null, { name: "سيف" });
    expect(state.step).toBe("confirm");
    expect(state.name).toBe("سيف");
  });

  it("«عميل ستيشن78» رقمُ انتظار لا اسم — يُسأل صاحبه", () => {
    const { state } = walk([...toPhone, txt("07801234567")], null, { name: "عميل ستيشن78" });
    expect(state.step).toBe("name");
  });

  it("التوصيل يسأل الاسم قبل العنوان", () => {
    const base = [btn("o|cat|c-fries"), btn("o|item|i-wed"), btn("o|add"), btn("o|checkout"), btn("o|ch|delivery")];
    const afterPhone = walk([...base, txt("07801234567")]);
    expect(afterPhone.state.step).toBe("name");
    const afterName = walk([...base, txt("07801234567"), txt("أبو علي")]);
    expect(afterName.state.step).toBe("address");
  });
});

/**
 * أخطاءٌ وصلت من زبونٍ حقيقي — كلّ واحدةٍ هنا كلّفت طلباً.
 *
 * المنيو هنا أقرب إلى الحقيقي: بيتزاتان تشتركان في كلمة «بيتزا»، وواحدة
 * إملاؤها يخالف ما يكتبه الناس («بروني» ويكتبونها «ببروني»).
 */
const REAL: Menu = {
  categories: [{ id: "c", name: "بيتزا" }],
  items: [
    { id: "i-sup", categoryId: "c", name: "بيتزا سوبريم", price: 12000, sizes: [], doughs: [] },
    { id: "i-pep", categoryId: "c", name: "بيتزا بروني", price: 12000, sizes: [], doughs: [] },
    { id: "i-rnc", categoryId: "c", name: "بيتزا تشكن رانش", price: 13000, sizes: [], doughs: [] },
    { id: "i-zng", categoryId: "c", name: "زنجر بوفالو", price: 5000, sizes: [], doughs: [] },
  ],
};

describe("فهم الطلب — أخطاء وقعت فعلاً", () => {
  it("«ببروني» بحرفٍ مكرّر تطابق «بروني» ولا تصير سوبريم", () => {
    const lines = understand("بيتزا ببروني", REAL);
    expect(lines?.map((l) => l.name)).toEqual(["بيتزا بروني"]);
  });

  it("«بلا زحمة» تأدّبٌ لا ملاحظة، و«بدون بصل» هي الملاحظة", () => {
    const lines = understand("بيتزا ببروني بلا زحمة اريدها بدون بصل", REAL);
    expect(lines).toHaveLength(1);
    expect(lines![0].name).toBe("بيتزا بروني");
    expect(lines![0].note).toBe("بدون بصل");
  });

  it("اسم القسم وحده لا يختار صنفاً — يُترك للنموذج ليسأل", () => {
    expect(understand("اريد بيتزا", REAL)).toBeNull();
  });

  it("ملاحظتان تُحفظان معاً لا واحدة", () => {
    const lines = understand("زنجر بوفالو بدون بصل وزيادة جبن", REAL);
    expect(lines).toHaveLength(1);
    expect(lines![0].note).toContain("بدون بصل");
    expect(lines![0].note).toContain("زيادة جبن");
  });
});
