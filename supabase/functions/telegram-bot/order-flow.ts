/**
 * محرّك حوار الطلب — بلا تليغرام، بلا شبكة، بلا قاعدة.
 *
 * يأخذ (حالة المحادثة، ما أرسله الزبون، المنيو) ويعيد (حالة جديدة، ردّاً،
 * وطلباً جاهزاً حين يكتمل). كل ما يعرفه عن العالم يأتيه وسيطاً؛ ولهذا يُختبر
 * بلا متصفح ولا هاتف، ولهذا واتساب لاحقاً محوّلٌ صغير لا إعادة كتابة.
 *
 * المسار: start → cats → items → item → cart → channel → phone → address → confirm → sent
 *
 * كل سؤال أزرار، إلا الملاحظة والعنوان ورقم الهاتف نصّاً. لا ذكاء اصطناعي
 * في هذه المرحلة — `understand()` في الأسفل هو المقبس الذي يُستبدل بنموذج
 * لغوي حين يتوفّر المفتاح، فيفهم «نحن خمسة، ٣ برجر بلا بصل» بدل الأزرار.
 */

export type MenuSize = { id: string; name: string; price: number };
export type MenuItem = { id: string; categoryId: string; name: string; price: number; sizes: MenuSize[]; doughs: string[] };
export type Menu = { categories: { id: string; name: string }[]; items: MenuItem[] };

export type CartLine = {
  itemId: string;
  name: string;
  sizeName: string | null;
  dough: string | null;
  qty: number;
  unitPrice: number;
  note: string | null;
};

export type Step = "start" | "cats" | "items" | "item" | "cart" | "channel" | "phone" | "address" | "confirm";

export type State = {
  flow: "order";
  step: Step;
  cart: CartLine[];
  catId?: string;
  draft?: { itemId: string; sizeId: string | null; dough: string | null; qty: number; note: string | null; awaitingNote?: boolean };
  channel?: "delivery" | "pickup";
  phone?: string | null;
  address?: string | null;
  name?: string | null;
};

export type Input =
  | { kind: "text"; text: string }
  | { kind: "button"; data: string }
  | { kind: "contact"; phone: string }
  | { kind: "voice" };

/** ما يعرفه المحل عن هذا الزبون من قبل — يُقرأ بالهاتف بعد أن يعطيه */
export type Known = { address?: string | null; name?: string | null };

export type Button = { text: string; data: string };
export type Reply = {
  text: string;
  buttons?: Button[][];
  /** اطلب رقم الهاتف بزرّ تليغرام «شارك رقمي» */
  requestContact?: boolean;
  /** الطلب مكتمل — يُرسَل إلى الكاشير */
  order?: OrderPayload;
};

export type OrderPayload = {
  channel: "delivery" | "pickup";
  customer_name: string | null;
  phone: string;
  address: string | null;
  note: string | null;
  lines: { item_id: string; variant: string | null; flavor: string | null; qty: number }[];
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export const START: State = { flow: "order", step: "start", cart: [] };

const BTN_CART = (n: number): Button => ({ text: n ? `🛒 السلّة (${n})` : "🛒 السلّة", data: "o|cart" });
const BTN_CATS: Button = { text: "⬅️ الأقسام", data: "o|cats" };
const BTN_HOME: Button = { text: "🏠 البداية", data: "o|start" };

/**
 * أرقام العراق كما تصل: +9647701234567 / 009647… / 07701234567. تُطوى إلى
 * الصيغة المحلية لأنها ما تحمله القاعدة، وإلا صار الزبون ثلاثة زبائن.
 */
export function normalizeIraqiPhone(raw: string): string | null {
  const digits = normDigits(raw).replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("00964")) local = local.slice(5);
  else if (local.startsWith("964")) local = local.slice(3);
  if (!local.startsWith("0")) local = `0${local}`;
  return /^07\d{9}$/.test(local) ? local : null;
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

function lineLabel(l: CartLine): string {
  const bits = [l.name];
  if (l.sizeName) bits.push(l.sizeName);
  if (l.dough) bits.push(l.dough);
  return bits.join(" · ");
}

function cartText(cart: CartLine[]): string {
  if (!cart.length) return "🛒 سلّتك فارغة.";
  const rows = cart.map((l, i) => `${i + 1}. ${esc(lineLabel(l))} ×${l.qty} — ${fmt(l.unitPrice * l.qty)} د.ع${l.note ? `\n   📝 ${esc(l.note)}` : ""}`);
  return `🛒 <b>سلّتك</b>\n\n${rows.join("\n")}\n\n<b>المجموع: ${fmt(cartTotal(cart))} د.ع</b>`;
}

/**
 * المقبس الذي سيصير ذكاءً اصطناعياً.
 *
 * اليوم: نصّ حرّ خارج سياق سؤال يُعاد إلى الأزرار. غداً: نموذج لغوي يقرأ
 * «نحن خمسة، ٣ برجر بلا بصل واثنان بصل» ويعيد عمليات على السلّة. التوقيع
 * مقصود: يأخذ النصّ والمنيو ويعيد سطوراً — لا يعرف تليغرام ولا الحالة.
 */
export function understand(_text: string, _menu: Menu): CartLine[] | null {
  return null;
}

// ── الشاشات ──────────────────────────────────────────────────────────────────

function screenStart(state: State): { state: State; reply: Reply } {
  const n = state.cart.reduce((s, l) => s + l.qty, 0);
  return {
    state: { ...state, step: "start", draft: undefined },
    reply: {
      text: "🍔 <b>ستيشن</b>\nاطلب من القائمة وسيصلك خلال دقائق.",
      buttons: [[{ text: "🍕 اطلب الآن", data: "o|cats" }], ...(n ? [[BTN_CART(n)]] : [])],
    },
  };
}

function screenCats(state: State, menu: Menu): { state: State; reply: Reply } {
  const withItems = menu.categories.filter((c) => menu.items.some((i) => i.categoryId === c.id));
  const rows: Button[][] = [];
  for (let i = 0; i < withItems.length; i += 2) {
    rows.push(withItems.slice(i, i + 2).map((c) => ({ text: c.name, data: `o|cat|${c.id}` })));
  }
  const n = state.cart.reduce((s, l) => s + l.qty, 0);
  rows.push([BTN_CART(n), BTN_HOME]);
  return { state: { ...state, step: "cats", draft: undefined }, reply: { text: "اختر القسم:", buttons: rows } };
}

function screenItems(state: State, menu: Menu, catId: string): { state: State; reply: Reply } {
  const cat = menu.categories.find((c) => c.id === catId);
  const items = menu.items.filter((i) => i.categoryId === catId);
  if (!cat || !items.length) return screenCats(state, menu);
  const rows: Button[][] = items.map((i) => [{ text: `${i.name} — ${fmt(i.price)}`, data: `o|item|${i.id}` }]);
  const n = state.cart.reduce((s, l) => s + l.qty, 0);
  rows.push([BTN_CATS, BTN_CART(n)]);
  return { state: { ...state, step: "items", catId, draft: undefined }, reply: { text: `<b>${esc(cat.name)}</b> — اختر الصنف:`, buttons: rows } };
}

function draftPrice(item: MenuItem, sizeId: string | null): number {
  const size = item.sizes.find((s) => s.id === sizeId);
  return size ? size.price : item.price;
}

function screenItem(state: State, menu: Menu): { state: State; reply: Reply } {
  const d = state.draft!;
  const item = menu.items.find((i) => i.id === d.itemId);
  if (!item) return screenCats(state, menu);
  const price = draftPrice(item, d.sizeId);
  const rows: Button[][] = [];
  if (item.sizes.length) rows.push(item.sizes.map((s) => ({ text: `${s.id === d.sizeId ? "✅ " : ""}${s.name} — ${fmt(s.price)}`, data: `o|size|${s.id}` })));
  if (item.doughs.length) rows.push(item.doughs.map((g) => ({ text: `${g === d.dough ? "✅ " : ""}${g}`, data: `o|dough|${g}` })));
  rows.push([{ text: "➖", data: "o|qty|-" }, { text: `${d.qty}`, data: "o|noop" }, { text: "➕", data: "o|qty|+" }]);
  rows.push([{ text: d.note ? `📝 ${d.note}` : "📝 ملاحظة (بلا بصل…)", data: "o|note" }]);
  rows.push([{ text: `✅ أضف للسلّة — ${fmt(price * d.qty)} د.ع`, data: "o|add" }]);
  rows.push([{ text: "⬅️ رجوع", data: `o|cat|${item.categoryId}` }]);
  const lines = [`<b>${esc(item.name)}</b>`, `${fmt(price)} د.ع`];
  if (item.doughs.length) lines.push("اختر العجينة:");
  return { state: { ...state, step: "item" }, reply: { text: lines.join("\n"), buttons: rows } };
}

function screenCart(state: State): { state: State; reply: Reply } {
  const rows: Button[][] = state.cart.map((l, i) => [{ text: `❌ ${lineLabel(l)} ×${l.qty}`, data: `o|rm|${i}` }]);
  rows.push([{ text: "➕ أضف المزيد", data: "o|cats" }]);
  if (state.cart.length) rows.push([{ text: "✅ إتمام الطلب", data: "o|checkout" }]);
  return { state: { ...state, step: "cart", draft: undefined }, reply: { text: cartText(state.cart), buttons: rows } };
}

function screenChannel(state: State): { state: State; reply: Reply } {
  return {
    state: { ...state, step: "channel" },
    reply: {
      text: "كيف تستلم طلبك؟",
      buttons: [[{ text: "🛵 توصيل", data: "o|ch|delivery" }, { text: "🏪 استلام من المحل", data: "o|ch|pickup" }], [{ text: "⬅️ السلّة", data: "o|cart" }]],
    },
  };
}

function screenPhone(state: State): { state: State; reply: Reply } {
  return {
    state: { ...state, step: "phone" },
    reply: { text: "📞 رقم هاتفك — اضغط «شارك رقمي» أو اكتبه:\n<code>07XXXXXXXXX</code>", requestContact: true },
  };
}

function screenAddress(state: State, known?: Known): { state: State; reply: Reply } {
  const rows: Button[][] = [];
  if (known?.address) rows.push([{ text: `📍 نفس العنوان: ${known.address.slice(0, 40)}`, data: "o|addr|same" }]);
  rows.push([{ text: "⬅️ السلّة", data: "o|cart" }]);
  return { state: { ...state, step: "address" }, reply: { text: "📍 اكتب عنوان التوصيل (المنطقة، الشارع، أقرب معلم):", buttons: rows } };
}

function screenConfirm(state: State): { state: State; reply: Reply } {
  const lines = [cartText(state.cart), "", state.channel === "delivery" ? `🛵 توصيل إلى: ${esc(state.address ?? "")}` : "🏪 استلام من المحل", `📞 ${esc(state.phone ?? "")}`, "", "الدفع عند الاستلام."];
  return {
    state: { ...state, step: "confirm" },
    reply: {
      text: lines.join("\n"),
      buttons: [[{ text: "✅ أرسل الطلب", data: "o|send" }], [{ text: "✏️ تعديل السلّة", data: "o|cart" }, { text: "❌ إلغاء", data: "o|start" }]],
    },
  };
}

function buildOrder(state: State): OrderPayload {
  const notes = state.cart.filter((l) => l.note).map((l) => `${lineLabel(l)} ×${l.qty}: ${l.note}`);
  return {
    channel: state.channel ?? "pickup",
    customer_name: state.name ?? null,
    phone: state.phone ?? "",
    address: state.channel === "delivery" ? state.address ?? null : null,
    note: notes.length ? notes.join(" · ") : null,
    lines: state.cart.map((l) => ({ item_id: l.itemId, variant: l.sizeName, flavor: l.dough, qty: l.qty })),
  };
}

// ── الخطوة ───────────────────────────────────────────────────────────────────

/**
 * خطوة واحدة من الحوار. الحالة تدخل وتخرج؛ لا شيء يُحفظ هنا.
 */
export function step(prev: State | null, input: Input, menu: Menu, known?: Known): { state: State; reply: Reply } {
  const state: State = prev?.flow === "order" ? prev : { ...START };

  if (input.kind === "voice") {
    return { state, reply: { text: "🎤 الطلب بالصوت قريباً — الآن اختر من الأزرار.", buttons: [[{ text: "🍕 اطلب الآن", data: "o|cats" }]] } };
  }

  if (input.kind === "contact") {
    const phone = normalizeIraqiPhone(input.phone);
    if (!phone) return { state, reply: { text: "الرقم غير عراقي — اكتبه بالصيغة <code>07XXXXXXXXX</code>", requestContact: true } };
    return afterPhone({ ...state, phone }, known);
  }

  if (input.kind === "text") {
    const text = input.text.trim();
    if (/^\/start\b/.test(text) || text === "/order") return screenStart(state);

    if (state.step === "item" && state.draft?.awaitingNote) {
      const note = text.slice(0, 80);
      return screenItem({ ...state, draft: { ...state.draft, note: note === "-" ? null : note, awaitingNote: false } }, menu);
    }
    if (state.step === "phone") {
      const phone = normalizeIraqiPhone(text);
      if (!phone) return { state, reply: { text: "الرقم غير صالح — اكتبه هكذا: <code>07XXXXXXXXX</code>", requestContact: true } };
      return afterPhone({ ...state, phone }, known);
    }
    if (state.step === "address") {
      if (text.length < 5) return screenAddress(state, known);
      return screenConfirm({ ...state, address: text.slice(0, 300) });
    }
    // نصّ حرّ في غير سؤال: مقبس الفهم — فارغ اليوم
    const parsed = understand(text, menu);
    if (parsed?.length) return screenCart({ ...state, cart: [...state.cart, ...parsed] });
    return screenStart(state);
  }

  // أزرار
  const [prefix, cmd, arg] = input.data.split("|");
  if (prefix !== "o") return screenStart(state);

  switch (cmd) {
    case "start": return screenStart({ ...state, cart: [] });
    case "cats": return screenCats(state, menu);
    case "cat": return screenItems(state, menu, arg);
    case "item": {
      const item = menu.items.find((i) => i.id === arg);
      if (!item) return screenCats(state, menu);
      return screenItem({ ...state, draft: { itemId: item.id, sizeId: item.sizes[0]?.id ?? null, dough: item.doughs[0] ?? null, qty: 1, note: null } }, menu);
    }
    case "size": if (state.draft) return screenItem({ ...state, draft: { ...state.draft, sizeId: arg } }, menu); break;
    case "dough": if (state.draft) return screenItem({ ...state, draft: { ...state.draft, dough: arg } }, menu); break;
    case "qty": if (state.draft) return screenItem({ ...state, draft: { ...state.draft, qty: Math.min(20, Math.max(1, state.draft.qty + (arg === "+" ? 1 : -1))) } }, menu); break;
    case "note":
      if (state.draft) return { state: { ...state, draft: { ...state.draft, awaitingNote: true } }, reply: { text: "📝 اكتب الملاحظة (مثل: بلا بصل). أرسل <code>-</code> لحذفها." } };
      break;
    case "add": {
      const d = state.draft;
      const item = d && menu.items.find((i) => i.id === d.itemId);
      if (!d || !item) return screenCats(state, menu);
      const size = item.sizes.find((s) => s.id === d.sizeId) ?? null;
      const line: CartLine = { itemId: item.id, name: item.name, sizeName: size?.name ?? null, dough: d.dough, qty: d.qty, unitPrice: size ? size.price : item.price, note: d.note };
      return screenCart({ ...state, cart: [...state.cart, line] });
    }
    case "cart": return screenCart(state);
    case "rm": return screenCart({ ...state, cart: state.cart.filter((_, i) => i !== Number(arg)) });
    case "checkout": return state.cart.length ? screenChannel(state) : screenCart(state);
    case "ch": return screenPhone({ ...state, channel: arg === "delivery" ? "delivery" : "pickup" });
    case "addr": if (arg === "same" && known?.address) return screenConfirm({ ...state, address: known.address }); break;
    case "send": {
      if (!state.cart.length || !state.phone) return screenCart(state);
      if (state.channel === "delivery" && !state.address) return screenAddress(state, known);
      const order = buildOrder(state);
      return { state: { ...START }, reply: { text: "⏳ جارٍ إرسال طلبك…", order } };
    }
    case "noop": return screenItem(state, menu);
  }
  return screenStart(state);
}

function afterPhone(state: State, known?: Known): { state: State; reply: Reply } {
  const withName = { ...state, name: state.name ?? known?.name ?? null };
  if (withName.channel === "delivery") return screenAddress(withName, known);
  return screenConfirm(withName);
}
