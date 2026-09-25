import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";
import { renderMenuLink, renderMessage, renderRateScale, renderReply, renderSavedOrders, renderWelcome, type WaMessage } from "@/lib/bot/whatsapp-render";
import { isShopOpen } from "@/lib/cafe/shop-open";
import { closedOrderText, closedText } from "@/lib/cafe/hours";
import { BRAND } from "@/lib/brand";
import { rememberWaiting } from "@/lib/cafe/waitlist";
import { customerNameFrom } from "@/lib/cafe/wa-name";
import { rateStep, type RateState } from "../../../../../supabase/functions/telegram-bot/rating-flow";
import { savedOrderLabel, savedOrderToLines, type SavedOrder } from "../../../../../supabase/functions/telegram-bot/reorder";
import { humanPause, TEXT_UNCLEAR, VOICE_UNCLEAR, understandAudio, understandSmart, type LlmBudget, type Parsed, type PhraseMemory } from "../../../../../supabase/functions/telegram-bot/llm";
import {
  dropClosed,
  extractWhen,
  normalizeIraqiPhone,
  phoneOrigin,
  START,
  step,
  understand,
  type CartLine,
  type Button,
  type Input,
  type Known,
  type Menu,
  type OrderPayload,
  type State,
} from "../../../../../supabase/functions/telegram-bot/order-flow";

/**
 * بوت واتساب — نفس محرّك تليغرام، وعرضٌ آخر.
 *
 * لماذا هنا لا في دالة حافة كتليغرام: هذا المسار يُنشر مع الدفعة نفسها، بلا
 * أمر نشر ثانٍ على جهاز أحد. والمحرّك (order-flow.ts) يُستورَد كما هو — نسخة
 * واحدة تخدم القناتين، فلا يفترقان في السلوك أبداً.
 *
 * ثلاثة فروق عن تليغرام، كلّها هنا:
 *   · لا «شارك رقمي»: رقم واتساب هو المرسِل نفسه، فيُملأ تلقائياً ولا يُسأل.
 *   · الأزرار: ثلاثة كحدّ أقصى، وما زاد قائمةٌ بعشرة صفوف — فالتصفيح ضرورة.
 *   · التوقيع: العنوان عامّ، فتُتحقَّق بصمة Meta على الجسم قبل أي عمل.
 */

export const dynamic = "force-dynamic";

/**
 * حدث حالة من Meta: أُرسلت؟ سُلّمت؟ قُرئت؟ أم فشلت ولماذا؟
 *
 * كانت تُسجَّل كلّها سطراً واحداً بلا تفصيل — «حدث بلا رسائل» — فحين قال المالك
 * «أرسلت ولم يردّ» لم يكن في السجلّ ما يجيب. ورقم التجربة من Meta لا يُسلّم إلا
 * إلى الأرقام المضافة يدوياً، وفشلُه يأتي هنا **حدثَ حالة لا خطأَ API**: أي
 * بالضبط في السطر الذي كنّا نرميه. والرقم يُقصّ إلى آخر أربع خانات — يكفي
 * لتمييز المستلم ولا يُفرغ دفتر أرقام الزبائن في سجلّ تشخيص.
 */
type WaStatus = {
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

function describeStatus(st: WaStatus): string {
  const who = st.recipient_id ? `…${st.recipient_id.slice(-4)}` : "—";
  const err = st.errors?.[0];
  const why = err ? ` (${err.code ?? "?"}: ${err.error_data?.details ?? err.title ?? err.message ?? "بلا تفصيل"})` : "";
  return `${st.status ?? "؟"} → ${who}${why}`;
}


const GRAPH = "https://graph.facebook.com/v21.0";
// trimmed: a value pasted into a dashboard field carries a trailing newline more
// often than anyone admits, and an HMAC over the wrong secret fails silently
const TOKEN = () => (process.env.WHATSAPP_TOKEN ?? "").trim();
const PHONE_ID = () => (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
const APP_SECRET = () => (process.env.WHATSAPP_APP_SECRET ?? "").trim();
const VERIFY = () => (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();

/**
 * كل ما يصل هذا العنوان يُسجَّل — قبل التحقّق من البصمة وبعده.
 *
 * بلا هذا، «البوت لا يعمل» سؤال بلا جواب: لا يُعرف أوصلت رسالة Meta أصلاً أم
 * وصلت ورُفضت. يُقرأ من /setup ← سجلّ الويبهوك، أو من webhook_log مباشرة.
 */
async function note(status: number, body: string, why: string) {
  try {
    const svc = createSupabaseServiceClient();
    await svc.rpc("log_webhook", { p_route: "/api/whatsapp/webhook", p_status: status, p_body: body.slice(0, 900), p_note: why });
  } catch {
    /* التشخيص لا يُفشل ما يشخّصه */
  }
}
const SITE = () => (process.env.STATION_SITE_URL ?? "https://stationiraq.com").replace(/\/$/, "");

// ── حالة المحادثة: نفس جدول بوت تليغرام، بمفتاح مسبوق بـ wa: فلا يتصادمان ──
type Ui = { buttons: Button[]; text: string; lastMsgId?: string; humanAt?: string; unclearAt?: string; closedAt?: string };
const key = (waId: string) => `wa:${waId}`;
const uiKey = (waId: string) => `wa:${waId}:ui`;

/**
 * عمر المحادثة قبل أن تُنسى.
 *
 * محادثةٌ نصفَ مكتملة عمرها أسبوعان ليست محادثة. زبونٌ ترك سلّته عند سؤال
 * «شنو اسمك؟» ثم كتب بعد أربعة عشر يوماً «مرحبا» كان يُستأنف به إلى ذلك
 * السؤال نفسه — فيردّ بما لا يُفهم، ويظنّ البوت كلامَه غامضاً، ويدور
 * الاثنان. وهذا ما حصل فعلاً على رقمٍ في ٩ أيلول استُؤنف في ٢٣ منه.
 *
 * ستّ ساعات: أطول من جلسة طلبٍ حقيقية بكثير، وأقصر من أن يعود الزبون فيجد
 * نفسه في منتصف سؤالٍ نسيه. وتُطبَّق على حالة المحادثة وحدها لا على صفّ
 * `:ui` — فذاك يحمل «طلب موظّفاً» و«المحل مغلق»، وهي مؤقّتاتٌ لها حسابها.
 */
const STATE_TTL_MS = 6 * 60 * 60 * 1000;

async function readState<T>(chatId: string, maxAgeMs?: number): Promise<T | null> {
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("bot_state").select("state, updated_at").eq("chat_id", chatId).maybeSingle();
  if (!data) return null;
  if (maxAgeMs && data.updated_at) {
    const age = Date.now() - new Date(data.updated_at as string).getTime();
    if (Number.isFinite(age) && age > maxAgeMs) return null;
  }
  return (data.state as T | undefined) ?? null;
}
async function writeState(chatId: string, state: unknown): Promise<void> {
  const svc = createSupabaseServiceClient();
  // `updated_at` يُكتب صراحةً: قيمته الافتراضية `now()` تعمل عند الإدراج
  // وحده، فصفٌّ يُحدَّث مئة مرّة كان يبقى بتاريخ أوّل مرّة — ولا يُعرف عمر
  // محادثةٍ من صفٍّ لا يتحرّك تاريخه
  await svc
    .from("bot_state")
    .upsert({ chat_id: chatId, state: state as Json, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
}

/**
 * السقف اليومي لنداءات النموذج — عدّادٌ في نفس جدول الحالة، بلا ترحيل.
 *
 * الحساب الذي خرج منه الرقم: المنيو والتعليمات نحو ألفين وستّمئة رمز، والردّ
 * مئة وعشرون. فالنداء الواحد بأسوأ حال — بلا خزينٍ مؤقّت — نحو ثلاث أعشار
 * السنت. ومئةٌ وعشرون نداءً في اليوم تعني أربعين سنتاً، أي اثني عشر دولاراً
 * في الشهر **لو لم يُخزَّن شيء ولم تُفهم عبارةٌ مرّتين** — وكلاهما لا يحدث.
 *
 * وعملياً: الذاكرة والقواعد تبتلعان أكثر الرسائل، والخزين المؤقّت يخفض الباقي
 * إلى عُشره. فالعشرون دولاراً تكفي شهوراً، والسقف موجودٌ ليوم الحملة لا ليوم
 * العمل العادي. يُرفع أو يُخفض من `LLM_DAILY_CAP` بلا نشر.
 */
const llmBudget: LlmBudget = {
  async take() {
    const cap = Number(process.env.LLM_DAILY_CAP ?? 120);
    if (!Number.isFinite(cap) || cap <= 0) return false;
    // يوم بغداد لا يوم الخادم: الخادم بتوقيت UTC، فالعدّاد كان يُصفَّر الثالثة فجراً
    const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const chatId = `llm:${day}`;
    const used = (await readState<{ n?: number }>(chatId))?.n ?? 0;
    if (used >= cap) {
      if (used === cap) await note(200, "", `سقف النموذج اليومي (${cap}) بلغ — القواعد وحدها لبقيّة اليوم`);
      return false;
    }
    await writeState(chatId, { n: used + 1 });
    return true;
  },
};

// ── الإرسال ────────────────────────────────────────────────────────────────
async function send(to: string, message: WaMessage): Promise<void> {
  if (!TOKEN() || !PHONE_ID()) {
    await note(503, "", "لا يُرسَل: WHATSAPP_TOKEN أو WHATSAPP_PHONE_NUMBER_ID ناقص");
    return;
  }
  try {
    const res = await fetch(`${GRAPH}/${PHONE_ID()}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...message }),
      signal: AbortSignal.timeout(8000),
    });
    // الفشل الصامت أخفى «البوت متوقف» أياماً: Meta يقول السبب (توكن منتهٍ، رقم غير مفعّل…) — يُسجَّل
    if (!res.ok) await note(res.status, (await res.text()).slice(0, 600), "Meta رفض الإرسال");
  } catch (e) {
    // رسالة ضاعت لا تُسقط المحادثة؛ الزبون يكتب ثانيةً
    await note(599, "", `تعذّر الوصول إلى Meta: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
  }
}
const sendText = (to: string, body: string) => send(to, { type: "text", text: { body, preview_url: false } });

/** ذاكرة العبارات (0094): supabase-js هنا، REST في تيليغرام — الجدول واحد */
const phraseMemory: PhraseMemory = {
  async get(key) {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("bot_phrases").select("intent, parsed, hits").eq("text_key", key).maybeSingle();
    if (!data) return null;
    void svc.from("bot_phrases").update({ hits: (data.hits ?? 1) + 1, updated_at: new Date().toISOString() }).eq("text_key", key);
    return { intent: data.intent, ...((data.parsed as Parsed | null) ?? {}) };
  },
  async put(key, text, intent, parsed, source) {
    const svc = createSupabaseServiceClient();
    await svc.from("bot_phrases").upsert({ text_key: key, text: text.slice(0, 400), intent, parsed: parsed as unknown as Json, source }, { onConflict: "text_key", ignoreDuplicates: true });
  },
};

// ── المنيو: نفس المنظورين العامّين اللذين يقرؤهما بوت تليغرام ──────────────
async function loadMenu(): Promise<Menu> {
  const svc = createSupabaseServiceClient();
  const [{ data: items }, { data: vars }] = await Promise.all([
    svc.from("menu_public").select("id, category_id, name_ar, price, flavors, category_name, category_sort, category_late_cutoff, sort").order("category_sort").order("sort"),
    svc.from("variant_public").select("id, item_id, kind, name_ar, price, sort").eq("kind", "size").order("sort"),
  ]);
  const cats = new Map<string, { id: string; name: string }>();
  const list = (items ?? []) as { id: string; category_id: string; name_ar: string; price: number; flavors: unknown; category_name: string; category_late_cutoff?: boolean }[];
  const closed = new Set<string>();
  for (const it of list) {
    if (!cats.has(it.category_id)) cats.set(it.category_id, { id: it.category_id, name: it.category_name });
    if (it.category_late_cutoff) closed.add(it.category_id);
  }
  const sizes = (vars ?? []) as { id: string; item_id: string; name_ar: string; price: number }[];
  return dropClosed({
    categories: [...cats.values()],
    items: list.map((it) => ({
      id: it.id,
      categoryId: it.category_id,
      name: it.name_ar,
      price: it.price,
      sizes: sizes.filter((v) => v.item_id === it.id).map((v) => ({ id: v.id, name: v.name_ar, price: v.price })),
      doughs: Array.isArray(it.flavors) ? (it.flavors as string[]) : [],
    })),
  }, closed);
}

async function knownCustomer(phone: string | null): Promise<Known> {
  if (!phone) return {};
  try {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("customers").select("name_ar, address").eq("phone", phone).maybeSingle();
    return { name: data?.name_ar ?? null, address: data?.address ?? null };
  } catch {
    return {};
  }
}

/**
 * أوّل رسالةٍ من رقمٍ جديد تكتبه في دفتر الزبائن — بلا أن ينتظر طلباً.
 *
 * الزبون الذي كتب «هلو» ثم انصرف كان يضيع: لا طلب فلا صفّ في الدفتر، ولا
 * وسيلة لمعاودته. وواتساب يعطينا اسمه ورقمه في الرسالة الأولى نفسها، فتُكتب
 * هنا قبل أي شيء آخر.
 *
 * والاسم لا يُستبدل إن كان الدفتر يحمل اسماً كتبه موظّف — ما كتبه إنسانٌ
 * أصدق مما اختاره الزبون لملفّه. أمّا الأسماء التلقائية («عميل ستيشن ١٢»)
 * فتُستبدل باسمٍ حقيقي متى عُرف.
 *
 * ويعيد الاسم الذي يُنادى به في التحيّة، أو `null` فتحيّةٌ عامّة.
 */
async function rememberCustomer(waId: string, profileName: string | null): Promise<string | null> {
  const phone = normalizeIraqiPhone(waId);
  const name = customerNameFrom(profileName);
  if (!phone) return name;
  try {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("customers").select("id, name_ar").eq("phone", phone).maybeSingle();
    const auto = (n: string | null) => !n || /^عميل ستيشن/.test(n.trim());
    if (!data) {
      await svc.from("customers").insert({ phone, name_ar: name, source: "بوت واتساب" });
    } else if (name && auto(data.name_ar)) {
      await svc.from("customers").update({ name_ar: name }).eq("id", data.id);
    }
    // اسم الدفتر يسبق اسم الملفّ: كتبه موظّفٌ عن معرفة
    return (!auto(data?.name_ar ?? null) ? (data?.name_ar ?? null) : null) ?? name;
  } catch {
    return name;
  }
}

async function submitOrder(waId: string, order: OrderPayload): Promise<void> {
  const secret = process.env.STATION_WEBHOOK_SECRET;
  if (!secret) return void sendText(waId, "⚠️ المطعم لم يُفعّل الطلب عبر واتساب بعد.");
  try {
    const r = await fetch(`${SITE()}/api/orders/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-station-secret": secret },
      body: JSON.stringify({ ...order, source: "whatsapp", whatsapp_wa_id: waId }),
      signal: AbortSignal.timeout(9000),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; order_number?: string; error?: string };
    if (j.error === "closed") return void sendText(waId, CLOSED_TEXT());
    if (!r.ok || !j.ok) return void sendText(waId, "تعذّر إرسال الطلب — أعد المحاولة أو اتصل بالمطعم.");
    await sendText(waId, `✅ وصل طلبك — رقمه *${j.order_number}*\nنخبرك لمن يتقبل ويجهز.`);
  } catch {
    await sendText(waId, "تعذّر إرسال الطلب — أعد المحاولة أو اتصل بالمطعم.");
  }
}

// ── دورة الرسالة ───────────────────────────────────────────────────────────
type WaMsg = { from?: string; id?: string; type?: string; text?: { body?: string }; audio?: { id?: string; mime_type?: string }; location?: { latitude?: number; longitude?: number; name?: string; address?: string }; interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } } };

/**
 * دبوس الخريطة عنوانٌ صالح — بل أدقّ ممّا سيكتبه الزبون.
 *
 * كان يصل رسالةً بلا نصّ فيُهمَل، ويُعاد سؤال العنوان نفسه بلا نهاية. يُحوّل
 * هنا إلى سطر يقرؤه السائق: ما سمّاه واتساب إن وُجد، ورابط خرائط دائماً.
 */
function locationText(loc: NonNullable<WaMsg["location"]>): string {
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  const named = [loc.name, loc.address].filter(Boolean).join(" — ");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return named;
  const pin = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  return named ? `${named} (${pin})` : `📍 ${pin}`;
}

function inputOf(msg: WaMsg): Input {
  const id = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
  if (id) return { kind: "button", data: id };
  if (msg.type === "audio" || msg.type === "voice") return { kind: "voice" };
  if (msg.location) return { kind: "text", text: locationText(msg.location) };
  return { kind: "text", text: String(msg.text?.body ?? "") };
}

/** الرسالة الصوتية تُنزَّل من Meta كما هي — الفهم في understandAudio */
/**
 * تنزيل الرسالة الصوتية من Meta — ويقول لماذا فشل إن فشل.
 *
 * كان يبتلع كل خطأ ويعيد `null`، فيردّ البوت «ما فهمت رسالتك الصوتية» سواء
 * سقط التنزيل، أو انتهى التوكن، أو عجز النموذج. وثلاثتها أعطالٌ مختلفة
 * علاجها مختلف، وكانت تظهر بوجهٍ واحد.
 */
async function fetchAudio(msg: WaMsg): Promise<{ audio: ArrayBuffer; mime: string } | null> {
  const mediaId = msg.audio?.id;
  if (!mediaId) {
    await note(422, "", "صوت بلا معرّف وسائط");
    return null;
  }
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN()}` }, signal: AbortSignal.timeout(8000) });
    if (!meta.ok) {
      await note(meta.status, (await meta.text()).slice(0, 300), "Meta رفض وصف الوسائط");
      return null;
    }
    const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
    if (!url) {
      await note(422, "", "وصف الوسائط بلا رابط");
      return null;
    }
    const file = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` }, signal: AbortSignal.timeout(15000) });
    if (!file.ok) {
      await note(file.status, "", "تعذّر تنزيل الملفّ الصوتي");
      return null;
    }
    const audio = await file.arrayBuffer();
    await note(200, "", `صوت وصل: ${(audio.byteLength / 1024).toFixed(0)}KB ${mime_type ?? "?"}`);
    return { audio, mime: (mime_type ?? msg.audio?.mime_type ?? "audio/ogg").split(";")[0] };
  } catch (e) {
    await note(599, "", `تنزيل الصوت تعثّر: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`);
    return null;
  }
}

/*
 * كانت جملةً ثابتة: «نستقبل الطلبات من ٩ الصبح لـ٣ الفجر».
 *
 * فلمّا صار افتتاح الجمعة ١ ظهراً صارت تكذب على كل من يراسلنا الجمعة صباحاً —
 * تقول له «تعال من ٩» فيجي ويلقى الباب مغلقاً. والآن تُحسب من `hours.ts`.
 */
const CLOSED_TEXT = () => closedText(BRAND.phoneDisplay);

/** الطلبات المحفوظة لهذا الرقم (قيّمها فوق ٨) — آخر خمسة */
async function savedOrders(waId: string): Promise<SavedOrder[]> {
  const svc = createSupabaseServiceClient();
  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, subtotal, created_at")
    .eq("whatsapp_wa_id", waId)
    .eq("saved_for_customer", true)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!orders?.length) return [];
  const { data: items } = await svc.from("order_items").select("order_id, item_id, variant_id, name_ar, flavor_ar, qty, note").in("order_id", orders.map((o) => o.id));
  return orders.map((o) => ({ ...o, items: (items ?? []).filter((i) => i.order_id === o.id) }));
}

/** إجابة تقييم (زرّ r|N أو نصّ) — تكمل الأسئلة وتحفظ النتيجة */
async function rateTurn(waId: string, state: RateState, input: Input, msgId: string | undefined, ui: Ui | null): Promise<void> {
  const rin = input.kind === "button" && input.data.startsWith("r|") ? { kind: "score" as const, value: Number(input.data.split("|")[1]) } : input.kind === "text" ? { kind: "text" as const, text: input.text } : null;
  if (!rin) return;
  const out = rateStep(state, rin);
  const svc = createSupabaseServiceClient();
  await Promise.all([
    writeState(key(waId), out.state),
    writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msgId }),
  ]);
  if (out.reply.done) {
    const s = out.state;
    await svc.from("order_ratings").upsert({ order_id: s.orderId, food: s.food ?? null, service: s.service ?? null, ordering: s.ordering ?? null, advice: out.reply.done.advice, score: out.reply.done.score, source: "whatsapp" }, { onConflict: "order_id" });
    if (out.reply.done.save) await svc.from("orders").update({ saved_for_customer: true }).eq("id", s.orderId);
    await writeState(key(waId), { ...START });
  }
  await humanPause();
  await send(waId, out.reply.scale ? renderRateScale(out.reply.text) : { type: "text", text: { body: out.reply.text.replace(/\*/g, "*"), preview_url: false } });
}

/** رابط المنيو بوضع التوصيل والرقم مملوءاً — الزبون لا يكتب رقمه مرتين */
function menuLink(waId: string): string {
  const phone = normalizeIraqiPhone(waId);
  return `${SITE()}/menu?mode=delivery${phone ? `&phone=${phone}` : ""}`;
}

/**
 * الزبون كتب نصّاً: سؤال، شكوى، «أريد موظفاً» — الجواب عند إنسان لا عند
 * الآلة. تُرفع بطاقة على شاشة الطلبات الواردة (كما طلبات توترز) برقمه ونصّه،
 * وزرّ واتساب عليها يفتح محادثته من جهاز الكاشير. الرسائل التالية خلال ساعة
 * تُلحق بالبطاقة نفسها، ويُطمأن الزبون مرّة لا مع كل رسالة.
 */
async function handoff(waId: string, text: string, ui: Ui | null, msgId: string | undefined): Promise<void> {
  const svc = createSupabaseServiceClient();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: open } = await svc
    .from("external_order_alerts")
    .select("id, body")
    .eq("source", "other")
    .eq("ref", waId)
    .is("handled_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const line = `«${text.slice(0, 300)}»`;
  const prev = open?.[0];
  if (prev) {
    await svc.from("external_order_alerts").update({ body: `${prev.body ?? ""}\n${line}`.slice(-1000) }).eq("id", prev.id);
  } else {
    await svc.from("external_order_alerts").insert({ source: "other", ref: waId, title: "💬 زبون على واتساب يريد موظفاً", body: line });
  }
  // يُطمأن كل ربع ساعة لا مع كل رسالة — ولا يُترك بلا جواب ساعة كاملة
  const recently = ui?.humanAt && Date.now() - Date.parse(ui.humanAt) < 15 * 60_000;
  await note(200, "", `تحويل لموظف — مفاتيح: claude=${!!process.env.ANTHROPIC_API_KEY} gemini=${!!process.env.GEMINI_API_KEY} groq=${!!process.env.GROQ_API_KEY}`);
  await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msgId, humanAt: recently ? ui!.humanAt : new Date().toISOString() });
  if (!recently) {
    await humanPause();
    await sendText(waId, "وصلتنا رسالتك ✅ راح يجاوبك موظف بعد شوية.\nوإذا تحب تطلب هسة: " + menuLink(waId));
  }
}

async function turn(msg: WaMsg, profileName: string | null = null): Promise<void> {
  const waId = String(msg.from ?? "");
  if (!waId) return;
  // يُحفظ الاسم أوّلاً فيراه دفتر الزبائن ولو انقطعت المحادثة بعد حرف
  const hailName = await rememberCustomer(waId, profileName);

  const [prev, ui] = await Promise.all([readState<State>(key(waId), STATE_TTL_MS), readState<Ui>(uiKey(waId))]);
  // واتساب يعيد إرسال ما لم يُجَب عنه بسرعة — رسالة مرّتين تعني طلباً مرّتين
  if (msg.id && ui?.lastMsgId === msg.id) return;

  let understood: CartLine[] | null = null;
  let when: string | null = null;
  let raw = inputOf(msg);

  // تقييم جارٍ: أي جواب يكمله — إلا طلباً جديداً واضحاً فيقطعه
  if ((prev as unknown as RateState | null)?.flow === "rate") {
    const rs = prev as unknown as RateState;
    const wantsOrder = raw.kind === "button" ? !raw.data.startsWith("r|") : raw.kind === "text" && !!understand(raw.text, await loadMenu());
    if (!wantsOrder) {
      await rateTurn(waId, rs, raw, msg.id, ui);
      return;
    }
    await writeState(key(waId), { ...START });
  }

  // المطعم مغلق (لا وردية مفتوحة): يُجاب على كل رسالة (الصمت يبدو عطلاً)،
  // إلا رشقة رسائل خلال دقيقتين فتُجاب مرّة
  if (!(await isShopOpen())) {
    // يُسجَّل ليُخبَر أوّل ما تُفتح الوردية — وهو أثمن زبون: أرادنا ونحن مغلقون
    await rememberWaiting(waId);
    const said = ui?.closedAt && Date.now() - Date.parse(ui.closedAt) < 2 * 60_000;
    await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id, closedAt: said ? ui!.closedAt : new Date().toISOString() });
    if (!said) {
      await humanPause();
      const looksLikeOrder = raw.kind === "text" && raw.text.length > 6 && !!understand(raw.text, await loadMenu());
      await sendText(waId, looksLikeOrder ? closedOrderText(BRAND.phoneDisplay) : CLOSED_TEXT());
    }
    return;
  }

  // صوت: يُفهم مباشرة (Gemini يسمع) أو يُكتب ثم يُفهم؛ وإن لم يُفهم يُطلب الكتابة — لا موظف
  // (الطلب بالصوت لا يُعلَن في أي نصّ؛ يعمل لمن يعرفه)
  if (raw.kind === "voice") {
    const keys = { anthropic: process.env.ANTHROPIC_API_KEY, gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY };
    const got = await (async () => {
      if (!keys.gemini && !keys.groq) {
        // Claude لا يستقبل صوتاً — الصوت يحتاج Gemini أو Groq
        await note(503, "", "صوت بلا مفتاح يسمعه: GEMINI_API_KEY وGROQ_API_KEY ناقصان");
        return null;
      }
      const a = await fetchAudio(msg);
      if (!a) return null;
      const out = await understandAudio(a.audio, a.mime, await loadMenu(), keys, phraseMemory, (m) => void note(200, "", `صوت: ${m}`));
      if (!out) await note(422, "", "الصوت نُزِّل ولم يُفهم — النموذج لم يُرجع طلباً");
      return out;
    })();
    await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id });
    if (got && "lines" in got) {
      understood = got.lines;
    } else {
      await humanPause();
      await sendText(waId, got && "intent" in got && got.intent === "menu" ? got.reply + "\nللطلب: " + menuLink(waId) : VOICE_UNCLEAR);
      return;
    }
  }

  // نصّ: تحيّة أو «طلب» → الترحيب بزرّ المنيو؛ وإلا فسؤال لإنسان. الأزرار
  // القديمة (من كان في وسط طلب) تكمل على المحرّك كما كانت.
  if (raw.kind === "text" && !(prev?.flow === "order" && ["phone", "address"].includes(prev.step))) {
    const t = raw.text.trim();
    const welcome = async () => {
      await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id });
      await humanPause();
      await send(waId, renderWelcome((await savedOrders(waId)).length > 0, hailName));
    };
    // تحيّة صِرفة → الترحيب. أما «أريد أطلب ٢ زنجر» فليست تحيّة: تُفهم أولاً
    const pureGreeting = !t || t.length <= 2 || /^\/?(start|order)\b/i.test(t) || /^(مرحبا|مرحباً|هلا|هلو|السلام عليكم|السلام|سلام|hi|hello|hey|صباح الخير|مساء الخير)\s*[!.؟?]*$/i.test(t);
    if (pureGreeting) {
      await welcome();
      return;
    }
    // «٢ زنجر بوفالو وجبة وبيبسي» → سلّة يؤكّدها بالأزرار (ذاكرة ثم قواعد ثم Gemini/Groq)
    if (prev?.flow !== "order" || !prev.draft?.awaitingNote) {
      const menu = await loadMenu();
      const got = await understandSmart(t, menu, { anthropic: process.env.ANTHROPIC_API_KEY, gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY }, phraseMemory, llmBudget);
      if (got && "lines" in got) {
        understood = got.lines;
        when = extractWhen(t).when; // «الساعة 11» تُنقل للمطبخ مع الطلب
      } else if (got && "intent" in got && got.intent === "menu") {
        await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id });
        await humanPause();
        await sendText(waId, got.reply + "\nللطلب: " + menuLink(waId));
        return;
      } else if (/(طلب|اطلب|منيو|المنيو|قائمة|القائمة|اكل|أكل)/.test(t)) {
        // «أريد أطلب» بلا أصناف → الترحيب بزرّيه، لا موظف
        await welcome();
        return;
      } else if (!(ui?.unclearAt && Date.now() - Date.parse(ui.unclearAt) < 10 * 60_000)) {
        // أول مرّة لا تُفهم: اطلب إعادة الكتابة؛ الثانية خلال عشر دقائق → موظف
        await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id, unclearAt: new Date().toISOString() });
        await humanPause();
        await sendText(waId, TEXT_UNCLEAR);
        return;
      } else {
        await handoff(waId, t, ui, msg.id);
        return;
      }
    }
  }

  // تصفيح القائمة: شأن العرض وحده، لا يمسّ المحرّك
  const pageAt = raw.kind === "button" && raw.data.startsWith("w|page|") ? Number(raw.data.split("|")[2]) : null;
  if (pageAt != null && ui?.buttons?.length) {
    await writeState(uiKey(waId), { ...ui, lastMsgId: msg.id });
    await send(waId, renderMessage(ui.text, ui.buttons, Math.max(0, pageAt)));
    return;
  }

  // زرّا الترحيب: رابط المنيو، أو الطلب هنا بالكتابة أو من الأصناف
  if (raw.kind === "button" && raw.data === "w|link") {
    await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id });
    await humanPause();
    await send(waId, renderMenuLink(menuLink(waId)));
    return;
  }
  if (raw.kind === "button" && raw.data === "w|saved") {
    const list = await savedOrders(waId);
    await writeState(uiKey(waId), { ...(ui ?? { buttons: [], text: "" }), lastMsgId: msg.id });
    await humanPause();
    await send(waId, list.length ? renderSavedOrders(list.map((o) => ({ id: o.id, order_seq: o.order_seq, label: savedOrderLabel(o) }))) : renderWelcome(false));
    return;
  }
  if (raw.kind === "button" && raw.data.startsWith("w|re|")) {
    const chosenId = raw.data.slice(5);
    const chosen = (await savedOrders(waId)).find((o) => o.id === chosenId);
    const lines = chosen ? savedOrderToLines(chosen, await loadMenu()) : [];
    if (!lines.length) {
      await humanPause();
      await sendText(waId, "هذا الطلب ما عاد متوفر بأصنافه — اختار من المنيو 🙏");
      raw = { kind: "button", data: "o|cats" };
    } else {
      understood = lines;
    }
  }
  if (raw.kind === "button" && raw.data === "w|here") {
    await humanPause();
    await sendText(waId, "تكدر تكتب طلبك هنا (مثلاً: اثنين زنجر وجبة وبيبسي) أو تختار من الأصناف 👇");
    raw = { kind: "button", data: "o|cats" };
  }

  const menu = await loadMenu();
  const state = prev?.flow === "order" ? prev : null;
  const phone = normalizeIraqiPhone(waId);
  // ومن يراسلنا من رقمٍ غير عراقي: تُحمل جنسيّة رقمه معه، فيُقال له لماذا
  // نطلب رقماً آخر بدل أن يُسأل عن رقمٍ هو يراسلنا منه
  const known = { ...(await knownCustomer(phone ?? state?.phone ?? null)), foreign: phone ? null : phoneOrigin(waId) };

  let out = step(state && when ? { ...state, when } : when ? { ...START, when } : state, understood ? { kind: "lines", lines: understood } : raw, menu, known);
  // لا «شارك رقمي» في واتساب — ولا حاجة: المرسِل هو الرقم
  if (out.reply.requestContact && phone) out = step(out.state, { kind: "contact", phone: waId }, menu, known);
  if (!out.state.name && known.name) out.state.name = known.name;

  // شاشة البداية من المحرّك (زرّ «إلغاء» أو «الرئيسية») → الترحيب
  if (out.state.step === "start" && !out.reply.order) {
    await Promise.all([writeState(key(waId), out.state), writeState(uiKey(waId), { buttons: [], text: "", lastMsgId: msg.id })]);
    await send(waId, renderWelcome((await savedOrders(waId)).length > 0));
    return;
  }

  const view = renderReply(out.reply);
  await Promise.all([
    writeState(key(waId), out.state),
    writeState(uiKey(waId), { buttons: view.buttons, text: view.text, lastMsgId: msg.id } satisfies Ui),
  ]);
  await humanPause();
  await send(waId, view.message);
  if (out.reply.order) await submitOrder(waId, out.reply.order);
}

// ── الويبهوك ───────────────────────────────────────────────────────────────

/** تحقّق Meta عند الربط: تُعيد hub.challenge كما هي */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && VERIFY() && q.get("hub.verify_token") === VERIFY()) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  // بلا معاملات: فحص صحّة يقول ما إن كان مضبوطاً، بلا كشف شيء
  if (!q.get("hub.mode")) {
    return NextResponse.json({
      ok: true,
      endpoint: "station/whatsapp-bot",
      configured: Boolean(VERIFY() && TOKEN() && PHONE_ID() && APP_SECRET()),
    });
  }
  return new Response("forbidden", { status: 403 });
}

/** بصمة Meta على الجسم الخام — العنوان عامّ، وبلا هذا يطبع أي أحد طلباً في المطبخ */
function signed(raw: string, header: string | null): boolean {
  const secret = APP_SECRET();
  if (!secret || !header?.startsWith("sha256=")) return false;
  const mine = createHmac("sha256", secret).update(raw, "utf8").digest();
  const theirs = Buffer.from(header.slice(7), "hex");
  return mine.length === theirs.length && timingSafeEqual(mine, theirs);
}

export async function POST(req: Request) {
  // أول سطر، قبل أي فحص: يظهر في سجل نتلفاي حتى لو سقط كل ما بعده
  console.log("wa-hit", req.headers.get("x-hub-signature-256") ? "signed" : "unsigned", req.headers.get("user-agent") ?? "");
  if (!APP_SECRET() || !TOKEN() || !PHONE_ID()) {
    await note(503, "", "المتغيّرات ناقصة على الخادم");
    return new Response("not configured", { status: 503 });
  }
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!signed(raw, sig)) {
    await note(403, raw, sig ? "البصمة لا تطابق — راجع WHATSAPP_APP_SECRET" : "لم تصل بصمة من Meta");
    return new Response("bad signature", { status: 403 });
  }

  // بصمة الوصول تُكتب قبل الردّ لا بعده: لو ماتت الدالة مع قطع Meta للاتصال،
  // يبقى دليلٌ على أنّ الطلب وصل أصلاً — وهو أوّل ما نحتاج معرفته.
  await note(202, "", "وصل حدث من Meta");

  // نردّ فوراً ونعمل بعد الردّ.
  //
  // Meta تمهل الويبهوك ثوانيَ قليلة ثم تعتبر التسليم فاشلاً وتقطع الاتصال —
  // وقطعُها قد يقتل الدالة قبل أن تكتب سطراً واحداً. ودورة واحدة هنا تقرأ
  // المنيو كاملاً من قاعدة بيانات في سيدني، فالمهلة ليست فرضاً نظرياً.
  // لذا: 200 الآن، والمعالجة في after — وهو ما توصي به Meta نفسها.
  after(async () => {
    let seen = 0;
    try {
      const body = JSON.parse(raw) as {
        entry?: { changes?: { value?: { messages?: WaMsg[]; statuses?: WaStatus[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } }[] }[];
      };
      const states: string[] = [];
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          // اسم الزبون يأتي في `contacts` لا مع الرسالة — يُربط برقمه هنا
          const names = new Map<string, string>();
          for (const c of change.value?.contacts ?? []) {
            if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
          }
          for (const msg of change.value?.messages ?? []) {
            seen++;
            await turn(msg, names.get(String(msg.from ?? "")) ?? null);
          }
          for (const st of change.value?.statuses ?? []) states.push(describeStatus(st));
        }
      }
      // النجاح لا يحفظ الجسم: فيه رقم الزبون ونصّ رسالته، ولا يفيد التشخيص
      await note(200, "", seen ? `${seen} رسالة عولجت` : states.length ? states.join(" · ").slice(0, 300) : "حدث بلا رسائل");
    } catch (e) {
      await note(500, raw, e instanceof Error ? e.message.slice(0, 200) : "خطأ غير معروف");
    }
  });
  return new Response("ok", { status: 200 });
}
