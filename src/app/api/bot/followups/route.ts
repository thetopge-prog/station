import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";
import { rateStart } from "../../../../../supabase/functions/telegram-bot/rating-flow";
import { renderRateScale } from "@/lib/bot/whatsapp-render";

/**
 * متابعة ما بعد التسليم — يناديه pg_cron كل خمس دقائق (scripts/schedule-followups-cron.mjs).
 *
 * كل طلب سُلِّم قبل ٤٠ دقيقة أو أكثر ولم يُسأل صاحبه بعد، وصاحبه زبون بوت
 * (واتساب أو تيليغرام): يُرسل له سؤال التقييم الأول وتُكتب حالة «rate» في
 * bot_state ليُقرأ جوابه في الويبهوك/الدالة. ثم يُختم rating_asked_at.
 *
 * السرّ نفسه الذي يحمي استلام الطلبات (STATION_WEBHOOK_SECRET).
 */
export const dynamic = "force-dynamic";

const WAIT_MIN = 40;

export async function POST(req: Request) {
  const secret = process.env.STATION_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-job-secret") !== secret) return NextResponse.json({ ok: false }, { status: 403 });

  const svc = createSupabaseServiceClient();
  const due = new Date(Date.now() - WAIT_MIN * 60_000).toISOString();
  const { data: orders } = await svc
    .from("orders")
    .select("id, order_seq, whatsapp_wa_id, telegram_chat_id")
    .not("handed_at", "is", null)
    .lte("handed_at", due)
    .is("rating_asked_at", null)
    .neq("status", "cancelled")
    .or("whatsapp_wa_id.not.is.null,telegram_chat_id.not.is.null")
    .order("handed_at", { ascending: true })
    .limit(20);

  let sent = 0;
  for (const o of orders ?? []) {
    const { state, reply } = rateStart(o.id, o.order_seq);
    // يُختم قبل الإرسال: تكرار الإرسال أسوأ من ضياع سؤال
    await svc.from("orders").update({ rating_asked_at: new Date().toISOString() }).eq("id", o.id);
    if (o.whatsapp_wa_id) {
      await svc.from("bot_state").upsert({ chat_id: `wa:${o.whatsapp_wa_id}`, state: state as unknown as Json }, { onConflict: "chat_id" });
      await sendWhatsApp(o.whatsapp_wa_id, reply.text);
      sent++;
    } else if (o.telegram_chat_id) {
      await svc.from("bot_state").upsert({ chat_id: o.telegram_chat_id, state: state as unknown as Json }, { onConflict: "chat_id" });
      await sendTelegram(o.telegram_chat_id, reply.text);
      sent++;
    }
  }
  return NextResponse.json({ ok: true, sent });
}

async function sendWhatsApp(to: string, text: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...renderRateScale(text) }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const row = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ text: String(from + i), callback_data: `r|${from + i}` }));
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.replace(/\*([^*]+)\*/g, "<b>$1</b>"), parse_mode: "HTML", reply_markup: { inline_keyboard: [row(1, 5), row(6, 10)] } }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}
