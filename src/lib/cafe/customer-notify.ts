import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * يُبلّغ زبون البوت عن طلبه — من الفعل الذي ضغطه الكاشير نفسه.
 *
 * لا مهمة دورية ولا استطلاع: حين يُقبل الطلب أو يجهز أو يُلغى، الفعل الخادمي
 * الذي فعل ذلك ينادي هذه فوراً. رسالة واحدة لكل حدث، وعلى القناة التي جاء
 * منها الطلب — تليغرام أو واتساب — ولا شيء إن جاء من الكاشير.
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

/** واتساب لا يعرف HTML: العريض نجمتان */
const plain = (html: string) => html.replace(/<b>([\s\S]*?)<\/b>/g, "*$1*").replace(/<[^>]+>/g, "");

export async function notifyCustomerOrder(orderId: string, event: OrderEvent): Promise<void> {
  const tg = process.env.TELEGRAM_BOT_TOKEN;
  const wa = process.env.WHATSAPP_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!tg && !wa) return;
  try {
    const svc = createSupabaseServiceClient();
    const { data: o } = await svc
      .from("orders")
      .select("telegram_chat_id, whatsapp_wa_id, order_seq, channel")
      .eq("id", orderId)
      .maybeSingle();
    if (!o) return;

    const n = String(o.order_seq).padStart(3, "0");
    const html = TEXT[event](n, o.channel === "pickup");

    if (o.telegram_chat_id && tg) {
      await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: o.telegram_chat_id, text: html, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(3000),
      });
    }
    if (o.whatsapp_wa_id && wa && waPhoneId) {
      await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${wa}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: o.whatsapp_wa_id, type: "text", text: { body: plain(html), preview_url: false } }),
        signal: AbortSignal.timeout(3000),
      });
    }
  } catch {
    /* الإشعار ثانوي؛ الطلب نفسه سبق أن تمّ */
  }
}
