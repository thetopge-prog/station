import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";
import { renderMessage, renderReply, type WaMessage } from "@/lib/bot/whatsapp-render";
import {
  normalizeIraqiPhone,
  step,
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

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = () => process.env.WHATSAPP_TOKEN ?? "";
const PHONE_ID = () => process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const APP_SECRET = () => process.env.WHATSAPP_APP_SECRET ?? "";
const VERIFY = () => process.env.WHATSAPP_VERIFY_TOKEN ?? "";
const SITE = () => (process.env.STATION_SITE_URL ?? "https://station-anbar.netlify.app").replace(/\/$/, "");

// ── حالة المحادثة: نفس جدول بوت تليغرام، بمفتاح مسبوق بـ wa: فلا يتصادمان ──
type Ui = { buttons: Button[]; text: string; lastMsgId?: string };
const key = (waId: string) => `wa:${waId}`;
const uiKey = (waId: string) => `wa:${waId}:ui`;

async function readState<T>(chatId: string): Promise<T | null> {
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("bot_state").select("state").eq("chat_id", chatId).maybeSingle();
  return (data?.state as T | undefined) ?? null;
}
async function writeState(chatId: string, state: unknown): Promise<void> {
  const svc = createSupabaseServiceClient();
  await svc.from("bot_state").upsert({ chat_id: chatId, state: state as Json }, { onConflict: "chat_id" });
}

// ── الإرسال ────────────────────────────────────────────────────────────────
async function send(to: string, message: WaMessage): Promise<void> {
  if (!TOKEN() || !PHONE_ID()) return;
  try {
    await fetch(`${GRAPH}/${PHONE_ID()}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...message }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* رسالة ضاعت لا تُسقط المحادثة؛ الزبون يكتب ثانيةً */
  }
}
const sendText = (to: string, body: string) => send(to, { type: "text", text: { body, preview_url: false } });

// ── المنيو: نفس المنظورين العامّين اللذين يقرؤهما بوت تليغرام ──────────────
async function loadMenu(): Promise<Menu> {
  const svc = createSupabaseServiceClient();
  const [{ data: items }, { data: vars }] = await Promise.all([
    svc.from("menu_public").select("id, category_id, name_ar, price, flavors, category_name, category_sort, sort").order("category_sort").order("sort"),
    svc.from("variant_public").select("id, item_id, kind, name_ar, price, sort").eq("kind", "size").order("sort"),
  ]);
  const cats = new Map<string, { id: string; name: string }>();
  const list = (items ?? []) as { id: string; category_id: string; name_ar: string; price: number; flavors: unknown; category_name: string }[];
  for (const it of list) if (!cats.has(it.category_id)) cats.set(it.category_id, { id: it.category_id, name: it.category_name });
  const sizes = (vars ?? []) as { id: string; item_id: string; name_ar: string; price: number }[];
  return {
    categories: [...cats.values()],
    items: list.map((it) => ({
      id: it.id,
      categoryId: it.category_id,
      name: it.name_ar,
      price: it.price,
      sizes: sizes.filter((v) => v.item_id === it.id).map((v) => ({ id: v.id, name: v.name_ar, price: v.price })),
      doughs: Array.isArray(it.flavors) ? (it.flavors as string[]) : [],
    })),
  };
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
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; order_number?: string };
    if (!r.ok || !j.ok) return void sendText(waId, "تعذّر إرسال الطلب — أعد المحاولة أو اتصل بالمطعم.");
    await sendText(waId, `✅ وصل طلبك — رقمه *${j.order_number}*\nسنخبرك حين يُقبل ويجهز.`);
  } catch {
    await sendText(waId, "تعذّر إرسال الطلب — أعد المحاولة أو اتصل بالمطعم.");
  }
}

// ── دورة الرسالة ───────────────────────────────────────────────────────────
type WaMsg = { from?: string; id?: string; type?: string; text?: { body?: string }; interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } } };

function inputOf(msg: WaMsg): Input {
  const id = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
  if (id) return { kind: "button", data: id };
  if (msg.type === "audio" || msg.type === "voice") return { kind: "voice" };
  return { kind: "text", text: String(msg.text?.body ?? "") };
}

async function turn(msg: WaMsg): Promise<void> {
  const waId = String(msg.from ?? "");
  if (!waId) return;

  const [prev, ui] = await Promise.all([readState<State>(key(waId)), readState<Ui>(uiKey(waId))]);
  // واتساب يعيد إرسال ما لم يُجَب عنه بسرعة — رسالة مرّتين تعني طلباً مرّتين
  if (msg.id && ui?.lastMsgId === msg.id) return;

  const raw = inputOf(msg);

  // تصفيح القائمة: شأن العرض وحده، لا يمسّ المحرّك
  const pageAt = raw.kind === "button" && raw.data.startsWith("w|page|") ? Number(raw.data.split("|")[2]) : null;
  if (pageAt != null && ui?.buttons?.length) {
    await writeState(uiKey(waId), { ...ui, lastMsgId: msg.id });
    await send(waId, renderMessage(ui.text, ui.buttons, Math.max(0, pageAt)));
    return;
  }

  const menu = await loadMenu();
  const state = prev?.flow === "order" ? prev : null;
  const phone = normalizeIraqiPhone(waId);
  const known = await knownCustomer(phone ?? state?.phone ?? null);

  let out = step(state, raw, menu, known);
  // لا «شارك رقمي» في واتساب — ولا حاجة: المرسِل هو الرقم
  if (out.reply.requestContact && phone) out = step(out.state, { kind: "contact", phone: waId }, menu, known);
  if (!out.state.name && known.name) out.state.name = known.name;

  const view = renderReply(out.reply);
  await Promise.all([
    writeState(key(waId), out.state),
    writeState(uiKey(waId), { buttons: view.buttons, text: view.text, lastMsgId: msg.id } satisfies Ui),
  ]);
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
  if (!APP_SECRET() || !TOKEN() || !PHONE_ID()) return new Response("not configured", { status: 503 });
  const raw = await req.text();
  if (!signed(raw, req.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 403 });

  try {
    const body = JSON.parse(raw) as { entry?: { changes?: { value?: { messages?: WaMsg[] } }[] }[] };
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // statuses (تسليم/قراءة) تصل هنا أيضاً ولا تعنينا
        for (const msg of change.value?.messages ?? []) await turn(msg);
      }
    }
  } catch {
    /* لا نُعيد خطأً: Meta تعيد الإرسال، والإعادة تعني طلباً مكرّراً */
  }
  return new Response("ok", { status: 200 });
}
