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
import { defaultSize, foldWord, understand, type CartLine, type Menu } from "./order-flow.ts";

export type LlmKeys = { anthropic?: string; gemini?: string; groq?: string };
export type Parsed = { intent?: string; reply?: string; lines?: { item_id?: string; size?: string; qty?: number; note?: string }[] };
export type Understood = { lines: CartLine[] } | { intent: "menu"; reply: string } | { intent: "other" } | null;
/** الذاكرة: يوفّرها المنادي بحسب بيئته (supabase-js أو REST) */
export type PhraseMemory = {
  get(key: string): Promise<Parsed | null>;
  put(key: string, text: string, intent: "order" | "menu" | "other", parsed: Parsed, source: "rules" | "llm"): Promise<void>;
};

/**
 * سقفٌ يوميّ لنداءات النموذج — الضمانة الوحيدة التي لا تعتمد على تقدير.
 *
 * كل ما قبله توفيرٌ مُرجَّح: الذاكرة تبتلع المكرّر، والقواعد تبتلع الواضح،
 * والخزين المؤقّت يرخّص المنيو. لكن يوماً واحداً غريباً — حملةٌ إعلانية، أو
 * رسائل عشوائية — يقدر يأكل الرصيد كلّه، والمالك يكتشفه حين يصمت البوت.
 *
 * فهذا عدّادٌ صلب: إن نفد نصيب اليوم رجع النظام إلى القواعد وحدها، كما كان
 * قبل المفتاح — يعمل بلا انقطاع، ويُحوَّل ما لا يُفهم إلى موظّف. ولا يُنادى
 * النموذج ثانيةً إلّا غداً.
 *
 * `take()` يُنادى مرّةً قبل كل نداءٍ للنموذج، ويعيد false إذا نفد.
 */
export type LlmBudget = { take(): Promise<boolean> };

/**
 * مسربُ تشخيصٍ اختياري — يكتبه المنادي بحسب بيئته.
 *
 * طبقات الصوت تبتلع أخطاءها عمداً: رسالةٌ ضاعت لا تُسقط المحادثة. لكن
 * الابتلاع الصامت جعل أربعة أعطالٍ مختلفة تظهر بجملةٍ واحدة، وكلّف يوماً.
 * فما يُبتلع يُقال هنا، ولا يُغيَّر السلوك.
 */
export type LlmLog = (msg: string) => void;

/**
 * ما يُعرَض للنموذج: رقمٌ قصير والاسم والأحجام بأسعارها — لا شيء غير المنيو.
 *
 * والرقم بدل المعرّف الكامل توفيرٌ محسوب: معرّف القاعدة ستّة وثلاثون حرفاً
 * (`6021c3c5-86b9-…`) ويكلّف نحو خمسة عشر رمزاً، وتسعةٌ وسبعون صنفاً تعني
 * ألفاً ومئتي رمزٍ تُرسَل مع كل رسالة لتقول «هذا الصنف الثالث». الرقم يقولها
 * برمزٍ واحد — فينزل المنيو إلى ثلثه، وينزل الحساب معه.
 */
function menuRows(menu: Menu): string {
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
  return menu.items
    .map((i, n) => `${n + 1} | ${i.name} | ${i.sizes.length ? i.sizes.map((s) => `${s.name} ${fmt(s.price)}`).join(" / ") : fmt(i.price)} د.ع`)
    .join("\n");
}

/** ما يُقال حين يُسأل البوت عن نفسه أو عن التقنية — ثابت، لا يكتبه النموذج */
export const SELF_REPLY = "آني مساعد ستيشن للطلبات 😊 شتحب تطلب؟";

/**
 * الجزء الثابت من التعليمات: القواعد والمنيو، بلا رسالة الزبون.
 *
 * مفصولٌ عمداً — هذا وحده ما يُخزَّن مؤقّتاً عند Anthropic، والتخزين المؤقّت
 * مطابقةُ بدايةٍ حرفية: بايتٌ واحد يتغيّر في أوّله يُبطله كلّه. فلا تاريخ ولا
 * وقت ولا اسم زبونٍ هنا — المنيو والقواعد فقط، وهما لا يتغيّران بين رسالة
 * وأخرى. وعليه تُقرأ آلاف الرموز بعُشر ثمنها.
 */
export function systemPrompt(menu: Menu): string {
  return [
    "أنت موظّف استقبال طلبات في مطعم «ستيشن» بالرمادي — محافظة الأنبار، العراق.",
    "أنت من أهل الرمادي وتتكلّم مثلهم. جملة أو جملتان، ودّيّة، بلا رسميّة.",
    "",
    "اللهجة — الأهمّ، وأي خطأٍ فيها يكشف أنك لست منهم:",
    "- تكلّم عراقياً: شنو، شلونك، هسّه، تكدر، هواي، كلش، زين، ماكو، أكو، شكد، وياك، عدنا، نطلعلك.",
    "- ممنوعٌ منعاً باتّاً أي كلمة خليجية أو مصرية أو شامية. لا تكتب أبداً: وايد، شو، بدي، كتير، هلق، عايز، ازيك، دلوقتي، كده، برضه، حلو أوي، يلا بينا، تسلم إيدك.",
    "- بدل «وايد» قل «هواي» أو «كلش». بدل «شو» قل «شنو». بدل «كتير» قل «هواي».",
    "- الأعداد بالعراقي: وحدة، اثنين، ثلاثة، أربعة.",
    "",
    "قواعد صارمة:",
    "- لا تخترع صنفاً ولا سعراً ولا عرضاً غير موجود في المنيو أدناه. الأسعار من القائمة فقط.",
    "- لا تعِد بوقت توصيل محدّد ولا بخصم.",
    "- لا تقل أبداً إنك ذكاء اصطناعي أو نموذج أو برنامج أو بوت، ولا تذكر أي شركة تقنية. إن سُئلت: «آني موظّف ستيشن 😊».",
    "- لا تطلب كلمة سرّ ولا رقم بطاقة ولا أي معلومةٍ حسّاسة، ولا تجب عن سؤالٍ عنها.",
    "",
    "المنيو (رقم الصنف | الاسم | الأحجام والأسعار):",
    menuRows(menu),
    "",
    "أعد JSON فقط بهذا الشكل: {\"intent\":\"order\"|\"menu\"|\"other\",\"lines\":[{\"item_id\":\"<رقم الصنف من المنيو>\",\"size\":\"<اسم الحجم أو فارغ>\",\"qty\":<عدد>,\"note\":\"<ملاحظة أو فارغ>\"}],\"reply\":\"<ردّ قصير بالعراقي>\"}",
    "",
    "- intent=order: الرسالة فيها طلب أكل **وحدَّد الصنف** → lines بالأصناف، وreply فارغ.",
    "- intent=menu: **كل ما تقدر تجاوب عليه بنفسك** — سلام، اسم، «شلونك»، سؤال عن صنف أو سعر أو حجم، «شنو تنصحني»، «شنو عدكم»، تردّد، مزاح خفيف.",
    "  يعني: أي رسالةٍ ليست طلباً ولا تحتاج موظّفاً بشرياً.",
    "- intent=other: **فقط** ما يحتاج إنساناً: شكوى، «وين طلبي»، تأخير، استرجاع مبلغ، «أريد أكلّم موظّف»، أو سؤالٌ عن حساباتٍ وكلمات سرّ. lines فارغة وreply فارغ.",
    "",
    "قراءة الطلب — هنا يقع أكثر الخطأ، فاقرأ بتأنٍّ:",
    "١. **لا تستبدل صنفاً بصنف أبداً.** إن سمّى نكهةً أو نوعاً ليس في المنيو حرفياً، لا تختر أقرب شيء — اجعلها intent=menu واسأله: «عدنا (اذكر الموجود فعلاً) — أي وحدة تحب؟».",
    "٢. إن سمّى القسم فقط («بيتزا»، «كنتاكي»، «برجر») ولم يحدّد أيّها → intent=menu، واعرض عليه ما في المنيو من ذلك القسم واسأله. لا تخمّن.",
    "٣. **كلمات التأدّب ليست ملاحظات ولا أصنافاً.** «بلا زحمة» و«بلا أمر» و«من بعد إذنك» و«لو سمحت» كلّها تعني «رجاءً». تجاهلها تماماً.",
    "٤. الملاحظة هي ما يخصّ المطبخ فقط: «بدون بصل»، «زيادة جبن»، «حار»، «بلا مايونيز». اكتبها كلّها إن كانت أكثر من وحدة.",
    "٥. إن كانت في الرسالة مجاملةٌ وطلبٌ معاً، خذ الطلب واترك المجاملة.",
    "",
    "أسلوب الردّ في intent=menu — هذا ما يفرّق الموظّف عن الآلة:",
    "١. ردّ على ما قاله فعلاً، لا جواباً جاهزاً.",
    "٢. اقترح **صنفاً باسمه من المنيو** — لا تقل «عدنا هواي أصناف».",
    "٣. اختم بسؤالٍ يقرّبه من الطلب.",
    "ولا تُعد نفس الجملة مرّتين؛ نوّع.",
    "",
    "أمثلة (احتذِ بها في اللهجة والطول والأسلوب):",
    "«احمد» → menu: «هلا أحمد 🌟 شتحب تاكل اليوم؟ عدنا كنتاكي وبرجر وبيتزا.»",
    "«شنو افضل شيء عدكم؟» → menu: «أكثر شي يطلبوه الكنتاكي والزنجر 🔥 والبيتزا كلش زينة للمشاركة. تحب أجهّزلك زنجر وجبة؟»",
    "«شلونك» → menu: «هلا وغلا 😄 شلونك انت؟ شتحب نجهّزلك؟»",
    "«شي حار بس مو كثير» → menu: «جرّب السبايسي كرسبي — حار بس محسوب 🌶️ تحب ساندويچ لو وجبة؟»",
    "«بيتزا ببروني بلا زحمة اريدها بدون بصل» → order: سطر واحد = بيتزا بروني، note=«بدون بصل». و«بلا زحمة» تُهمَل — هي تأدّب لا ملاحظة.",
    "«اريد بيتزا» → menu: «حاضر 😊 عدنا بروني وسوبريم ومارغريتا وتشكن رانش — أي وحدة تحب؟» (لا تختر أنت).",
    "«كنتاكي» → menu: «تحب كنتاكي ٣ قطع لو ٤ لو ٦؟ 🍗» (لا تختر أنت).",
    "«زنجر بوفالو بدون بصل وزيادة جبن» → order: زنجر بوفالو، note=«بدون بصل · زيادة جبن».",
    "«وين طلبي؟» → other (lines وreply فارغان).",
    "«ما هي كلمة سر الحساب؟» → other (lines وreply فارغان).",
  ].join("\n");
}

const userPrompt = (text: string) => "رسالة الزبون: «" + text.slice(0, 400) + "»";

/** النصّ كاملاً في كتلةٍ واحدة — لمن لا يفصل تعليماته عن رسالته */
export function prompt(text: string, menu: Menu): string {
  return `${systemPrompt(menu)}\n\n${userPrompt(text)}`;
}

/**
 * Claude Haiku — النموذج المدفوع، ويُجرَّب أوّلاً لأنه أفهمهم للهجة الرمادي.
 *
 * ثلاثة أشياء تُبقي الحساب صغيراً، وكلٌّ منها مقصود:
 *
 * ١. لا يُنادى إلّا بعد أن تعجز الذاكرة والقواعد — وهما يبتلعان أكثر الرسائل
 *    مجاناً. وكل فهمٍ ينجح يُحفظ في الذاكرة، فالعبارة تُكلّف مرّةً في عمرها.
 * ٢. التعليمات والمنيو في `system` بعلامة `cache_control`، فتُقرأ من خزين
 *    Anthropic بعُشر الثمن بدل أن تُحاسَب كاملةً مع كل رسالة.
 * ٣. `max_tokens` صغير، ولا تفكير: الجواب JSON من سطرين لا مقال.
 *
 * وبالحساب: المنيو نحو ثلاثة آلاف رمز، والرسالة والجواب مئتان — فالرسالة
 * الجديدة دون سنتٍ واحد، والمكرّرة بلا ثمنٍ أصلاً.
 *
 * ويُنادى بـ`fetch` لا بحزمة Anthropic: هذا الملفّ يعمل في Deno (تيليغرام)
 * وNode (واتساب) معاً، ولا يحمل مكتبة — وهي القاعدة المكتوبة في رأسه.
 */
async function anthropic(key: string, text: string, menu: Menu): Promise<Parsed | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: [{ type: "text", text: systemPrompt(menu), cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: userPrompt(text) }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const raw = j.content?.find((b) => b.type === "text")?.text;
  if (!raw) return null;
  // قد يلفّ الجواب بسياج ```json — يُقشَّر قبل التحليل
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(body) as Parsed;
}

async function gemini(key: string, text: string, menu: Menu): Promise<Parsed | null> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
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
    // رقمٌ من المنيو المعروض، أو معرّفٌ كامل — الذاكرة تحمل محفوظاتٍ بالصيغتين
    const ref = String(l.item_id ?? "").trim();
    const n = /^\d{1,3}$/.test(ref) ? Number(ref) : 0;
    const item = n >= 1 && n <= menu.items.length ? menu.items[n - 1] : menu.items.find((i) => i.id === ref);
    if (!item) continue;
    const size = item.sizes.find((s) => s.name === (l.size ?? "").trim()) ?? defaultSize(item);
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
const ABOUT_SELF = /(ذكاء|اصطناعي|روبوت|\bبوت\b|برنامج|انت انسان|انت بشر|منو انت|من انت|شنو انت|مبني|تقنيه|\b(chatgpt|gpt|ai)\b)/i;

/**
 * جيل الذاكرة — يُزاد كلّما تغيّر معنى ما يفهمه المحلّل.
 *
 * العبارة تُخزَّن بنصّها ويُعاد تحليلها المخزون كما هو. فحين صُحِّح خطأ —
 * «الساعة ١١» قُرئت إحدى عشرة بيتزا — بقي التصحيح بلا أثر على من كتبها من
 * قبل: الذاكرة تسبق المحلّل وتردّ الخطأ نفسه إلى الأبد. وبزيادة الجيل
 * تُهجَر الصفوف القديمة بلا حذفٍ من القاعدة، وتُبنى من جديد بالمحلّل المصحَّح.
 *
 * ٢: تصحيح الساعة، والواو الملتصقة بعدد، وإملاء «بيزة» و«برقر» و«قجاج».
 * ٣: «بلا زحمة» صارت تأدّباً لا ملاحظة، والحرف المكرّر يُطوى («ببروني» =
 *    «بروني»)، واسمُ القسم وحده لم يعد يختار صنفاً — كلّها أخطاءٌ محفوظة.
 */
const MEM_GEN = "3";

export async function understandSmart(text: string, menu: Menu, keys: LlmKeys, memory?: PhraseMemory, budget?: LlmBudget): Promise<Understood> {
  const key = `${MEM_GEN}:${text.split(/\s+/).map(foldWord).filter(Boolean).join(" ").slice(0, 198)}`;
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

  // ٣. النموذج — بعد السقف اليومي، ونداءٌ واحدٌ للعدّاد لا نداءٌ لكل مزوّد
  if (budget && !(await budget.take().catch(() => true))) return null;
  // المدفوع أوّلاً، والمجّانيان احتياطٌ إن سقط أو نفد رصيده
  const chain = [
    keys.anthropic ? () => anthropic(keys.anthropic!, text, menu) : null,
    keys.gemini ? () => gemini(keys.gemini!, text, menu) : null,
    keys.groq ? () => groq(keys.groq!, text, menu) : null,
  ];
  for (const call of chain) {
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

/**
 * الصوت → نصّ. Groq (Whisper، مجاني) أولاً، وGemini يسمع الملف مباشرة احتياطاً.
 * النصّ الناتج يمرّ على understandSmart كأنه كُتب — فالصوت لا يزيد قاعدة.
 */
/**
 * تلميح المفردات للمفرّغ: أسماء المنيو، مقصوصةً إلى سقف Groq.
 *
 * التلميح يجعل الكلام السريع «زنجر بوفالو وجبة» يُكتب كما نكتبه نحن لا كما
 * يسمعه غريب. لكن السقف ٨٩٦ حرفاً، ومنيونا ١٧٤٩ — فكان الطلب يُرفض كلّه،
 * ويضيع التفريغ لا التلميح وحده.
 *
 * والقصّ عند فاصلة: اسمٌ نصفه يضلّل المفرّغ أكثر مما يعينه.
 */
const GROQ_PROMPT_MAX = 896;

export function vocabHint(menu: Menu): string {
  const head = "طلب من مطعم ستيشن: ";
  const tail = ". وجبة، ساندويچ، بدون بصل، توصيل.";
  const room = GROQ_PROMPT_MAX - head.length - tail.length;
  let names = menu.items.map((i) => i.name).join("، ");
  if (names.length > room) {
    names = names.slice(0, room);
    const cut = names.lastIndexOf("، ");
    if (cut > 0) names = names.slice(0, cut);
  }
  return head + names + tail;
}

/**
 * بايتات الصوت إلى base64 — على دفعات، لا دفعةً واحدة.
 *
 * `String.fromCharCode(...new Uint8Array(buf))` ينشر كل بايتٍ وسيطاً مستقلاً،
 * ومكدّس النداء له سقف: رسالةٌ صوتية من عشر ثوانٍ (نحو ٤٠ كيلوبايت) تمرّ،
 * ومن نصف دقيقة تُسقط الدالّة بـ`RangeError`. وكان ذلك السقوط يُبتلع في
 * `catch` صامت، فيردّ البوت «ما فهمت رسالتك الصوتية» على كل رسالةٍ طويلة —
 * وهي أكثر ما يُرسَل، لأن القصيرة تُكتب.
 *
 * ثمانية آلاف بايتٍ في الدفعة: تحت سقف كل محرّك بمراحل، وعدد الدفعات يبقى
 * صغيراً حتى لرسالةٍ من دقيقتين.
 */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(out);
}

export async function transcribe(audio: ArrayBuffer, mime: string, keys: LlmKeys, menu?: Menu, log?: LlmLog): Promise<string | null> {
  if (keys.groq) {
    try {
      const form = new FormData();
      form.append("file", new Blob([audio], { type: mime }), "voice." + (mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "mp3"));
      form.append("model", "whisper-large-v3");
      form.append("language", "ar");
      form.append("temperature", "0");
      form.append("response_format", "json");
      // أسماء المنيو تُعطى للنموذج كمفردات: الكلام السريع «زنجر بوفالو وجبة» يُكتب كما نكتبه
      // Groq يسقف تلميح المفردات بـ٨٩٦ حرفاً، وتسعةٌ وسبعون صنفاً تبلغ ١٧٤٩ —
      // فكان يردّ 400 ويسقط التفريغ كلّه. يُقصّ عند آخر فاصلةٍ قبل السقف، فلا
      // ينتهي التلميح باسمٍ نصفه
      if (menu) form.append("prompt", vocabHint(menu));
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${keys.groq}` }, body: form, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const j = (await res.json()) as { text?: string };
        const t = (j.text ?? "").trim();
        if (t) return t;
        log?.("Groq فرّغ نصّاً فارغاً");
      } else {
        log?.(`Groq تفريغ ${res.status}: ${(await res.text()).slice(0, 160)}`);
      }
    } catch (e) {
      log?.(`Groq تفريغ تعثّر: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
    }
  }
  if (keys.gemini) {
    try {
      const b64 = toBase64(audio);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${keys.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "اكتب ما قيل في هذا التسجيل بالعربية كما هو، بلا تعليق." }, { inlineData: { mimeType: mime, data: b64 } }] }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const t = (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
        if (t) return t;
      }
    } catch {
      /* لا شيء */
    }
  }
  return null;
}

/**
 * الصوت → فهم.
 *
 * **التفريغ أوّلاً، ثم الفهم بالنموذج الأقوى.** كان العكس: Gemini يسمع الملف
 * ويعيد الطلب مباشرة، بحجّة أن «سمع ثم فهم» أدقّ من خطوتين. والواقع خلافه —
 * Whisper مفرّغٌ متخصّص ويُعطى أسماء المنيو مفرداتٍ، فيكتب «زنجر بوفالو» كما
 * نكتبها؛ وClaude بعده يقرأ نصّاً نظيفاً بكامل قواعد اللهجة والمنيو. وسماعُ
 * ملفٍّ وفهمُه في نداءٍ واحد يُضعف الاثنين معاً.
 *
 * وGemini يبقى احتياطاً: إن لم يُفرَّغ الصوت أصلاً، يسمعه ويجتهد.
 */
export async function understandAudio(audio: ArrayBuffer, mime: string, menu: Menu, keys: LlmKeys, memory?: PhraseMemory, log?: LlmLog): Promise<Understood> {
  const text = await transcribe(audio, mime, keys, menu, log);
  if (text) {
    log?.(`فُرِّغ الصوت (${text.length} حرفاً): ${text.slice(0, 60)}`);
    const out = await understandSmart(text, menu, keys, memory);
    if (out) return out;
    log?.("النصّ المفرَّغ لم يُفهم طلباً — يُجرَّب السماع المباشر");
  } else {
    log?.("لم يُفرَّغ الصوت نصّاً — يُجرَّب السماع المباشر");
  }

  if (keys.gemini) {
    try {
      const b64 = toBase64(audio);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${keys.gemini}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt("(رسالة صوتية مرفقة — اسمعها بدقة، المتكلّم قد يكون سريعاً وبلهجة عراقية)", menu) }, { inlineData: { mimeType: mime, data: b64 } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        log?.(`Gemini صوت ${res.status}: ${(await res.text()).slice(0, 160)}`);
      } else {
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const raw = j.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = raw ? (JSON.parse(raw) as Parsed) : null;
        if (parsed) {
          const lines = toLines(parsed, menu);
          if (lines.length) return { lines };
          const reply = safeReply(parsed.reply);
          if (parsed.intent === "menu" && reply) return { intent: "menu", reply };
          log?.(`Gemini سمع وردّ intent=${parsed.intent ?? "?"} بلا أصناف`);
        } else {
          log?.("Gemini ردّ بلا نصّ يُحلَّل");
        }
      }
    } catch (e) {
      log?.(`Gemini صوت تعثّر: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
    }
  }
  return null;
}

/** ما يُقال حين لا يُفهم الصوت — لا تحويل لموظف من أول محاولة */
export const VOICE_UNCLEAR = "العفو بس ما فهمت رسالتك الصوتية، تكدر تكتب؟ 🙏";
/** ما يُقال حين لا يُفهم النصّ أول مرّة — الثانية تذهب لموظف */
export const TEXT_UNCLEAR = "العفو بس ما فهمت، تكدر تكتبها بشكل ثاني؟ مثلاً: «اثنين زنجر وجبة وبيبسي» 🙏";

/** تأخير بسيط قبل الردّ — ردٌّ في جزء من الثانية يُشعر الزبون بأنه يكلّم آلة */
export const humanPause = (ms = 1200 + Math.random() * 1300) => new Promise<void>((r) => setTimeout(r, ms));
