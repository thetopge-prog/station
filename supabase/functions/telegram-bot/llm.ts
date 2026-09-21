/**
 * فهم ما يكتبه الزبون: الذاكرة، ثم القواعد، ثم نموذج لغوي إن توفّر مفتاح.
 *
 *   ١. الذاكرة (bot_phrases): نفس العبارة كُتبت من قبل → نفس الفهم فوراً، بلا نموذج.
 *   ٢. القواعد (understand): مطابقة كلمات على أسماء المنيو — مجانية وفورية.
 *   ٣. Gemini ثم Groq: للجمل الغريبة. النموذج مقيَّد: يعيد معرّفات من المنيو
 *      المعطى فقط ويُتحقّق من كلّ معرّف، وردّه القصير (بالعراقي) محصور في المنيو
 *      والأسعار والطلب — لا يذكر تقنية ولا نماذج ولا ما بُني عليه النظام.
 *
 * كل فهم ناجح يُحفظ في الذاكرة — «يتعلم مما يطلبون». بلا مفتاح أو عند أي خطأ
 * أو بطء: null، ويكمل النظام كما كان.
 *
 * يعمل في Deno (تليغرام) وNode (واتساب): fetch فقط، لا مكتبات.
 */
import { foldWord, understand, type CartLine, type Menu } from "./order-flow.ts";

export type LlmKeys = { gemini?: string; groq?: string };
export type Parsed = { intent?: string; reply?: string; lines?: { item_id?: string; size?: string; qty?: number; note?: string }[] };
export type Understood = { lines: CartLine[] } | { intent: "menu"; reply: string } | { intent: "other" } | null;
/** الذاكرة: يوفّرها المنادي بحسب بيئته (supabase-js أو REST) */
export type PhraseMemory = {
  get(key: string): Promise<Parsed | null>;
  put(key: string, text: string, intent: "order" | "menu" | "other", parsed: Parsed, source: "rules" | "llm"): Promise<void>;
};

/** ما يُعرَض للنموذج: المعرّف والاسم والأحجام بأسعارها — لا شيء غير المنيو */
function menuRows(menu: Menu): string {
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  return menu.items
    .map((i) => `${i.id} | ${i.name} | ${i.sizes.length ? i.sizes.map((s) => `${s.name} ${fmt(s.price)}`).join(" / ") : fmt(i.price)} د.ع`)
    .join("\n");
}

/** ما يُقال حين يُسأل البوت عن نفسه أو عن التقنية — ثابت، لا يكتبه النموذج */
export const SELF_REPLY = "آني مساعد ستيشن للطلبات 😊 شتحب تطلب؟";

export function prompt(text: string, menu: Menu): string {
  return [
    "أنت موظّف طلبات في مطعم «ستيشن» بالرمادي. تكلّم باللهجة العراقية، بجمل قصيرة وودّية.",
    "قواعد صارمة:",
    "- موضوعك الوحيد: المنيو أدناه، أسعاره، والطلب. أي شيء آخر (سياسة، دين، برمجة، تقنية، أسئلة شخصية) → intent=other وreply فارغ.",
    "- لا تقل أبداً إنك ذكاء اصطناعي أو نموذج أو برنامج، ولا تذكر أي شركة تقنية أو على ماذا بُني النظام. إن سُئلت عن ذلك → intent=other.",
    "- لا تخترع صنفاً ولا سعراً ولا عرضاً غير موجود في المنيو. لا تعِد بوقت توصيل محدّد.",
    "- الأسعار والأصناف من القائمة أدناه فقط.",
    "",
    "المنيو (المعرّف | الاسم | الأحجام والأسعار):",
    menuRows(menu),
    "",
    "أعد JSON فقط بهذا الشكل: {\"intent\":\"order\"|\"menu\"|\"other\",\"lines\":[{\"item_id\":\"<معرّف من المنيو>\",\"size\":\"<اسم الحجم أو فارغ>\",\"qty\":<عدد>,\"note\":\"<ملاحظة أو فارغ>\"}],\"reply\":\"<ردّ قصير بالعراقي>\"}",
    "- intent=order: الرسالة طلب أكل → lines بالأصناف، وreply فارغ.",
    "- intent=menu: سؤال عن المنيو أو الأسعار أو الأحجام → lines فارغة، وreply جواب من المنيو فقط (سطر أو سطران) ينتهي بدعوة للطلب.",
    "- intent=other: كل ما عدا ذلك → lines فارغة وreply فارغ.",
    "اللهجة العراقية مقبولة في الأعداد (اثنين، ثلاث، وحدة، جوز).",
    "",
    "رسالة الزبون: «" + text.slice(0, 400) + "»",
  ].join("\n");
}

async function gemini(key: string, text: string, menu: Menu): Promise<Parsed | null> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt(text, menu) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = j.candidates?.[0]?.content?.parts?.[0]?.text;
  return raw ? (JSON.parse(raw) as Parsed) : null;
}

async function groq(key: string, text: string, menu: Menu): Promise<Parsed | null> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt(text, menu) }] }),
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = j.choices?.[0]?.message?.content;
  return raw ? (JSON.parse(raw) as Parsed) : null;
}

/** أسطر النموذج → أسطر سلّة حقيقية: معرّف موجود، حجم موجود، عدد معقول */
export function toLines(parsed: Parsed, menu: Menu): CartLine[] {
  const out: CartLine[] = [];
  for (const l of parsed.lines ?? []) {
    const item = menu.items.find((i) => i.id === l.item_id);
    if (!item) continue;
    const size = item.sizes.find((s) => s.name === (l.size ?? "").trim()) ?? item.sizes[0] ?? null;
    const qty = Math.min(20, Math.max(1, Math.round(Number(l.qty) || 1)));
    out.push({ itemId: item.id, name: item.name, sizeName: size?.name ?? null, dough: item.doughs[0] ?? null, qty, unitPrice: size ? size.price : item.price, note: (l.note ?? "").trim().slice(0, 80) || null });
  }
  return out;
}

/** ردّ النموذج يُصفّى مرّة أخيرة: لا حديث عن التقنية مهما قال */
const LEAK = /(ذكاء|اصطناعي|نموذج|روبوت|بوت|برنامج|gemini|groq|openai|gpt|claude|llama|ai\b|model|supabase|next\.?js|javascript|كود|برمج|خوارزم)/i;
function safeReply(r: string | undefined): string | null {
  const t = (r ?? "").trim().slice(0, 400);
  if (!t || LEAK.test(t)) return null;
  return t;
}

/** سؤال عن ذات البوت أو التقنية — يُجاب ثابتاً قبل أي نموذج */
const ABOUT_SELF = /(ذكاء|اصطناعي|روبوت|بوت|برنامج|انت انسان|انت بشر|منو انت|من انت|شنو انت|مبني|تقنية|chatgpt|gpt|ai)/i;

export async function understandSmart(text: string, menu: Menu, keys: LlmKeys, memory?: PhraseMemory): Promise<Understood> {
  const key = text.split(/\s+/).map(foldWord).filter(Boolean).join(" ").slice(0, 200);
  if (!key) return null;

  if (ABOUT_SELF.test(foldWord(text)) && !understand(text, menu)) return { intent: "menu", reply: SELF_REPLY };

  // ١. الذاكرة
  const remembered = memory ? await memory.get(key).catch(() => null) : null;
  if (remembered) {
    const lines = toLines(remembered, menu);
    if (lines.length) return { lines };
    const reply = safeReply(remembered.reply);
    if (remembered.intent === "menu" && reply) return { intent: "menu", reply };
    if (remembered.intent === "other") return { intent: "other" };
  }

  // ٢. القواعد
  const rules = understand(text, menu);
  if (rules) {
    await memory?.put(key, text, "order", { intent: "order", lines: rules.map((l) => ({ item_id: l.itemId, size: l.sizeName ?? "", qty: l.qty, note: l.note ?? "" })) }, "rules").catch(() => {});
    return { lines: rules };
  }

  // ٣. النموذج
  for (const call of [keys.gemini ? () => gemini(keys.gemini!, text, menu) : null, keys.groq ? () => groq(keys.groq!, text, menu) : null]) {
    if (!call) continue;
    try {
      const parsed = await call();
      if (!parsed) continue;
      const lines = toLines(parsed, menu);
      if (lines.length) {
        await memory?.put(key, text, "order", parsed, "llm").catch(() => {});
        return { lines };
      }
      const reply = safeReply(parsed.reply);
      if (parsed.intent === "menu" && reply) {
        await memory?.put(key, text, "menu", { intent: "menu", reply }, "llm").catch(() => {});
        return { intent: "menu", reply };
      }
      await memory?.put(key, text, "other", { intent: "other" }, "llm").catch(() => {});
      return { intent: "other" };
    } catch {
      /* مهلة أو JSON مكسور — الطبقة التالية */
    }
  }
  return null;
}

/** تأخير بسيط قبل الردّ — ردٌّ في جزء من الثانية يُشعر الزبون بأنه يكلّم آلة */
export const humanPause = (ms = 1200 + Math.random() * 1300) => new Promise<void>((r) => setTimeout(r, ms));
