/**
 * فهم الطلب المكتوب: القواعد أولاً (مجانية، فورية)، ثم نموذج لغوي إن توفّر مفتاح.
 *
 * Gemini (المجاني) ثم Groq احتياطاً. النموذج لا يخترع أصنافاً: يعيد معرّفات
 * من المنيو الذي أُعطي له فقط، ويُتحقّق من كل معرّف قبل أن يدخل السلّة.
 * بلا مفتاح، أو عند أي خطأ أو بطء — يعود null ويكمل النظام بالقواعد.
 *
 * يعمل في Deno (تليغرام) وNode (واتساب): fetch فقط، لا مكتبات.
 */
import { understand, type CartLine, type Menu } from "./order-flow.ts";

export type LlmKeys = { gemini?: string; groq?: string };
export type Understood = { lines: CartLine[] } | { intent: "other" } | null;

type Parsed = { intent?: string; lines?: { item_id?: string; size?: string; qty?: number; note?: string }[] };

function prompt(text: string, menu: Menu): string {
  const rows = menu.items
    .map((i) => `${i.id} | ${i.name}${i.sizes.length ? " | أحجام: " + i.sizes.map((s) => s.name).join("/") : ""}`)
    .join("\n");
  return [
    "أنت تقرأ رسالة زبون لمطعم وجبات سريعة عراقي وتحوّلها إلى JSON فقط.",
    "المنيو (معرّف | الاسم | الأحجام):",
    rows,
    "",
    "أعد JSON بهذا الشكل حصراً: {\"intent\":\"order\"|\"other\",\"lines\":[{\"item_id\":\"<معرّف من المنيو>\",\"size\":\"<اسم الحجم أو فارغ>\",\"qty\":<عدد>,\"note\":\"<ملاحظة أو فارغ>\"}]}",
    "intent=order إن كانت الرسالة طلب أكل، وإلا other مع lines فارغة. لا تخترع أصنافاً غير موجودة. اللهجة العراقية مقبولة (اثنين، ثلاث، وحدة).",
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

export async function understandSmart(text: string, menu: Menu, keys: LlmKeys): Promise<Understood> {
  const rules = understand(text, menu);
  if (rules) return { lines: rules };
  for (const call of [keys.gemini ? () => gemini(keys.gemini!, text, menu) : null, keys.groq ? () => groq(keys.groq!, text, menu) : null]) {
    if (!call) continue;
    try {
      const parsed = await call();
      if (!parsed) continue;
      const lines = toLines(parsed, menu);
      if (lines.length) return { lines };
      if (parsed.intent === "other") return { intent: "other" };
    } catch {
      /* مهلة أو JSON مكسور — الطبقة التالية */
    }
  }
  return null;
}
