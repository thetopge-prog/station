import "server-only";
import webpush from "web-push";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/** Push a new-order alert to every subscribed staff device. Never throws —
 *  a push failure must never fail the customer's order.
 *  ponytail: sent inline from the order action (zero extra infra); move to a
 *  DB trigger + edge function if order-submit latency ever matters. */
export async function sendNewOrderPush(p: { seq: number; table: string | null; count: number }) {
  try {
    const pub = process.env.WEB_PUSH_PUBLIC_KEY;
    const priv = process.env.WEB_PUSH_PRIVATE_KEY;
    if (!pub || !priv) return;
    const svc = createSupabaseServiceClient();
    /*
     * أجهزة الموظفين وحدها.
     *
     * الجدول صار يحمل أجهزة زبائن أيضاً (بيجر «طلبك جاهز»)، وهي `order_id`
     * مملوء. وبلا هذا الشرط يصل **هاتف الزبون** تنبيهُ «طلب جديد» الخاصّ
     * بالموظفين — يرنّ عليه كل طلبٍ يدخل المحل.
     */
    const { data: subs } = await svc
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .is("order_id", null);
    if (!subs?.length) return;

    webpush.setVapidDetails("mailto:teletelksa@gmail.com", pub, priv);
    const payload = JSON.stringify({
      title: `طلب جديد #${String(p.seq).padStart(3, "0")}`,
      body: `${p.table ? `طاولة ${p.table} · ` : ""}${p.count} صنف`,
      url: "/orders",
      tag: `pz-order-${p.seq}`,
    });

    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 });
        } catch (e) {
          // subscription gone (uninstalled / permission revoked) → drop the row
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await svc.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }),
    );
  } catch {
    /* missing env / transient DB error — order flow continues */
  }
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushBody = { title: string; body: string; url: string; tag?: string };

/**
 * يبعث إلى أجهزةٍ بعينها. يشترك معه `sendNewOrderPush` في كل ما يهمّ: مفاتيح
 * VAPID، ومهلة الحياة، وتنظيف الاشتراك الميت (404/410) — فلا نسخة ثانية من
 * هذا المنطق تُصان.
 *
 * ولا يرمي أبداً: إشعارٌ فشل لا يجوز أن يُفشل تعليم الطلب جاهزاً.
 */
export async function sendPushTo(targets: PushTarget[], body: PushBody): Promise<number> {
  if (!targets.length) return 0;
  const pub = process.env.WEB_PUSH_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!pub || !priv) return 0;
  let sent = 0;
  try {
    const svc = createSupabaseServiceClient();
    webpush.setVapidDetails("mailto:teletelksa@gmail.com", pub, priv);
    const payload = JSON.stringify(body);
    await Promise.allSettled(
      targets.map(async (t) => {
        try {
          await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await svc.from("push_subscriptions").delete().eq("endpoint", t.endpoint);
        }
      }),
    );
  } catch {
    /* بيئة ناقصة أو عثرة قاعدة — لا يُفشَل ما نادانا */
  }
  return sent;
}
