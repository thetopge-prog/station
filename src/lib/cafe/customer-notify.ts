import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendPushTo } from "./push";

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
export type OrderEvent = "accepted" | "ready" | "handed" | "cancelled";

/**
 * ما يُقال عند كل حدث — وبحسب طريقة الاستلام، لا نصّاً واحداً للجميع.
 *
 * «تفضّل استلمه من الكاونتر» جملةٌ خاطئة لزبونٍ جالسٍ في سيارته ينتظر الساعي
 * أن يطلع إليه: تُقيمه من مقعده بلا سبب، وقد يدخل فيتقاطع مع الساعي الخارج.
 */
const TEXT: Record<OrderEvent, (n: string, pickup: boolean, curbside?: boolean) => string | null> = {
  accepted: (n, pickup) =>
    `✅ طلبك رقم <b>${n}</b> انقبل وبدينا بيه.` + (pickup ? "\nنخبرك لمن يجهز للاستلام." : "\nنخبرك لمن يطلع للتوصيل."),
  ready: (n, pickup, curbside) =>
    curbside
      ? `🚗 طلبك رقم <b>${n}</b> جاهز — الساعي طالع إلك، انتظر بسيارتك.`
      : pickup
        ? `🍔 طلبك رقم <b>${n}</b> جاهز — تفضّل استلمه من الكاونتر.`
        : `✅ طلبك رقم <b>${n}</b> تم تجهيزه.`,
  // «سلّم للسائق» — للتوصيل فقط؛ الاستلام يكفيه «جاهز»
  handed: (n, pickup) => (pickup ? null : `🛵 طلبك رقم <b>${n}</b> استلمه موظف التوصيل — يوصلك بدقايق.`),
  cancelled: (n) => `❌ عذراً — أُلغي طلبك رقم <b>${n}</b>. راسلنا إذا كان بالغلط.`,
};

/** واتساب لا يعرف HTML: العريض نجمتان */
const plain = (html: string) => html.replace(/<b>([\s\S]*?)<\/b>/g, "*$1*").replace(/<[^>]+>/g, "");

export async function notifyCustomerOrder(orderId: string, event: OrderEvent): Promise<void> {
  const tg = process.env.TELEGRAM_BOT_TOKEN;
  const wa = process.env.WHATSAPP_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  // والدفع قناةٌ ثالثة الآن: الخروج المبكّر كان يمنع البيجر من الوصول أصلاً
  // في محلٍّ لا بوت فيه
  const push = !!process.env.WEB_PUSH_PRIVATE_KEY;
  if (!tg && !wa && !push) return;
  try {
    const svc = createSupabaseServiceClient();
    const { data: o } = await svc
      .from("orders")
      .select("telegram_chat_id, whatsapp_wa_id, order_seq, channel, pickup_code")
      .eq("id", orderId)
      .maybeSingle();
    if (!o) return;

    const n = String(o.order_seq).padStart(3, "0");
    const html = TEXT[event](n, o.channel === "pickup", o.channel === "curbside");
    if (!html) return;

    if (o.telegram_chat_id && tg) {
      await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: o.telegram_chat_id, text: html, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(3000),
      });
    }
    /*
     * البيجر: أجهزة الزبون المشتركة على هذا الطلب.
     *
     * ويُحذف الصفّ بعد الإرسال — البيجر لمرّة واحدة بطبيعته، والحذف يمنع
     * تراكم الاشتراكات بلا مكنسةٍ دورية. ولا يُحذف إلا بعد محاولة الإرسال،
     * فلا يضيع التنبيه لأننا نظّفنا مبكّراً.
     */
    if (push) {
      const { data: devices } = await svc
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("order_id", orderId);
      if (devices?.length) {
        await sendPushTo(
          devices.map((d) => ({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth })),
          {
            title: event === "ready" ? `طلبك رقم ${n} جاهز 🍔` : `طلبك رقم ${n}`,
            body: plain(html),
            url: `/t/${orderId}`,
            tag: `pager-${orderId}`,
          },
        );
        // انتهى دور هذا البيجر: أُرسل أو تعذّر، وفي الحالتين لا يُعاد
        if (event === "ready" || event === "handed" || event === "cancelled") {
          await svc.from("push_subscriptions").delete().eq("order_id", orderId);
        }
      }
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
