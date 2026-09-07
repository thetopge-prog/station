import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * يُبلّغ زبون تليغرام عن طلبه — من الفعل الذي ضغطه الكاشير نفسه.
 *
 * لا مهمة دورية ولا استطلاع: حين يُقبل الطلب أو يجهز أو يُلغى، الفعل الخادمي
 * الذي فعل ذلك ينادي هذه فوراً. رسالة واحدة لكل حدث، ولا شيء إن لم يأتِ
 * الطلب من البوت (لا telegram_chat_id).
 *
 * لا ترمي أبداً: إشعارٌ فشل لا يجوز أن يُفشل قبول طلب أو تجهيزه. مهلة ٣ ثوانٍ
 * لأن الفعل ينتظرها — على Netlify ما لا يُنتظر قد لا يُرسل.
 */
export type OrderEvent = "accepted" | "ready" | "cancelled";

const TEXT: Record<OrderEvent, (n: string, pickup: boolean) => string> = {
  accepted: (n, pickup) =>
    `✅ قُبل طلبك رقم <b>${n}</b> وبدأ تحضيره.` + (pickup ? "\nسنخبرك حين يجهز للاستلام." : "\nسنخبرك حين يخرج للتوصيل."),
  ready: (n, pickup) =>
    pickup ? `🍔 طلبك رقم <b>${n}</b> جاهز — تفضّل باستلامه من الكاونتر.` : `🛵 طلبك رقم <b>${n}</b> جاهز وفي طريقه إليك.`,
  cancelled: (n) => `❌ عذراً — أُلغي طلبك رقم <b>${n}</b>. راسلنا إن كان ذلك خطأً.`,
};

export async function notifyTelegramOrder(orderId: string, event: OrderEvent): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const svc = createSupabaseServiceClient();
    const { data: o } = await svc
      .from("orders")
      .select("telegram_chat_id, order_seq, channel")
      .eq("id", orderId)
      .maybeSingle();
    if (!o?.telegram_chat_id) return;

    const n = String(o.order_seq).padStart(3, "0");
    const text = TEXT[event](n, o.channel === "pickup");
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: o.telegram_chat_id, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* الإشعار ثانوي؛ الطلب نفسه سبق أن تمّ */
  }
}
