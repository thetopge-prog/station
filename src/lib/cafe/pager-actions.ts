"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoServer } from "./demo";

/**
 * البيجر الرقمي — الجانب العامّ.
 *
 * يناديه زبونٌ بلا حساب، فالحراسة كلّها في القاعدة (`pager_subscribe` في 0115):
 * المعرّف هو الإذن، واليوم وحده، وطلبٌ حيّ، وثلاثة أجهزة. ولا شيء هنا إلا
 * الترجمة إلى كلامٍ يُقرأ.
 */

export type PagerResult =
  | { ok: true }
  | { ok: false; error: string };

/** ما تقوله القاعدة، وما نقوله للزبون. ورسالةٌ لكل حالة — «فشل» لا تُشخَّص */
const SAY: Record<string, string> = {
  bad: "تعذّر تفعيل التنبيه على هذا الجهاز.",
  gone: "ما لكينا هذا الطلب.",
  old: "هذا رابط طلبٍ قديم — التنبيه لطلبات اليوم.",
  cancelled: "هذا الطلب ملغى.",
  done: "هذا الطلب تسلّمته خلص 👍",
  full: "ثلاثة أجهزة متنبّهة على هذا الطلب — وهو الحدّ.",
};

export async function subscribeToPager(
  orderId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<PagerResult> {
  if (isDemoServer()) return { ok: true };
  if (!orderId || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: SAY.bad };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("pager_subscribe", {
      p_order: orderId,
      p_endpoint: sub.endpoint,
      p_p256dh: sub.keys.p256dh,
      p_auth: sub.keys.auth,
    });
    if (error) return { ok: false, error: "تعذّر الاتصال — جرّب ثانية." };
    const r = String(data ?? "bad");
    return r === "ok" ? { ok: true } : { ok: false, error: SAY[r] ?? SAY.bad };
  } catch {
    return { ok: false, error: "تعذّر الاتصال — جرّب ثانية." };
  }
}
