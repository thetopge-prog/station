import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { customerNameFrom } from "./wa-name";
import { BRAND } from "@/lib/brand";
import type { Json } from "@/lib/types";

/**
 * من راسلنا والمطعم مسدود — يُخبَر أوّل ما نفتح.
 *
 * الزبون الذي كتب الساعة السابعة صباحاً وقيل له «نفتح ٩» كان يُترك بعدها: إمّا
 * يتذكّر وحده، وإمّا يذهب إلى غيرنا. وهو أثمن زبونٍ عندنا — أرادنا ونحن
 * مغلقون، وتكلفةُ تذكيره رسالةٌ واحدة.
 *
 * **والنافذة أربع وعشرون ساعة، وهي قاعدة ميتا لا اختيارنا:** لا يُرسَل نصٌّ
 * حرّ إلى من لم يراسلنا خلالها. ومن راسلنا فجراً وفتحنا صباحاً فنحن داخلها
 * براحة. ومن راسلنا قبل يومين يُحذف بلا رسالة — والقاعدة تحمي حسابنا من
 * الإيقاف، فلا تُلتف.
 */

/** مفتاح الانتظار في `bot_state` — المخزن العامّ نفسه، بلا جدولٍ لعلامة */
const KEY = (waId: string) => `wait:${waId}`;
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** حدٌّ للدفعة: ليلةٌ مزدحمة لا تعني مئتي رسالة في ثانية */
const MAX_BATCH = 200;

/** يُسجَّل حين يُقال له «المطعم مسدود». والتكرار يُحدِّث اللحظة ولا يضيف صفّاً */
export async function rememberWaiting(waId: string): Promise<void> {
  try {
    const svc = createSupabaseServiceClient();
    await svc
      .from("bot_state")
      .upsert({ chat_id: KEY(waId), state: { at: new Date().toISOString() } as unknown as Json }, { onConflict: "chat_id" });
  } catch {
    /* التسجيل رفاهية — لا يُسقط ردّ «المطعم مسدود» على الزبون */
  }
}

/**
 * فُتحت الوردية: يُخبَر المنتظِرون، ويُفرَغ الطابور.
 *
 * والصفّ يُحذف سواء أُرسلت الرسالة أم لا — الطابور ينظّف نفسه، ولا يبقى فيه
 * من فات وقته فيُراسَل بعد أسبوع.
 */
export async function flushWaiting(): Promise<number> {
  const svc = createSupabaseServiceClient();
  const { data: rows } = await svc
    .from("bot_state")
    .select("chat_id, state")
    .like("chat_id", "wait:%")
    .limit(MAX_BATCH);
  if (!rows?.length) return 0;

  // الأسماء باستعلامٍ واحد لا واحدٍ لكل زبون — نفس نمط listExpenses
  const ids = rows.map((r) => r.chat_id.slice(5));
  const phones = ids.map((w) => normalise(w)).filter((p): p is string => !!p);
  const nameOf = new Map<string, string>();
  if (phones.length) {
    const { data: cs } = await svc.from("customers").select("phone, name_ar").in("phone", phones);
    for (const c of cs ?? []) if (c.phone && c.name_ar) nameOf.set(c.phone, c.name_ar);
  }

  const now = Date.now();
  let sent = 0;
  for (const r of rows) {
    const waId = r.chat_id.slice(5);
    const at = Date.parse((r.state as { at?: string } | null)?.at ?? "");
    await svc.from("bot_state").delete().eq("chat_id", r.chat_id);
    if (!Number.isFinite(at) || now - at > WINDOW_MS) continue;
    const name = customerNameFrom(nameOf.get(normalise(waId) ?? "") ?? null);
    if (await sendText(waId, openedText(name, waId))) sent++;
  }
  return sent;
}

/** «07…» من معرّف واتساب — نسخةٌ صغيرة تكفي هنا بلا استيراد دالّة البوت */
function normalise(waId: string): string | null {
  const d = waId.replace(/\D/g, "").replace(/^00964/, "").replace(/^964/, "");
  const local = d.startsWith("0") ? d : `0${d}`;
  return /^07\d{9}$/.test(local) ? local : null;
}

/**
 * النصّ — تحيّةٌ لا إعلان.
 *
 * يبدأ بأنه لم يُنسَ، لأن هذا هو المعنى كلّه: راسلَنا ونحن مغلقون، وردَدنا
 * عليه حين فتحنا. وينتهي برابطٍ يطلب منه بضغطة، فالرسالة التي لا تُتبَع بفعل
 * تُقرأ وتُنسى.
 */
export function openedText(name: string | null, waId?: string): string {
  const hello = name ? `هلا ${name} 🌟` : "هلا بيك 🌟";
  const link = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://stationiraq.com").replace(/\/+$/, "")}/menu?mode=delivery${
    waId && normalise(waId) ? `&phone=${normalise(waId)}` : ""
  }`;
  return [
    hello,
    "راسلتنا والمطعم كان مسدود — وما نسيناك 🧡",
    "",
    "**إحنا هسة موجودين ونستقبل طلباتكم بكل حب.**",
    "المطبخ اشتغل، والزيت حامي، والكنتاكي أول شي نزل.",
    "",
    `دز طلبك من هنا: ${link}`,
    `أو اتصل بينا: ${BRAND.phoneDisplay}`,
  ].join("\n");
}

/** إرسال نصّ على واتساب — يعيد هل نجح، فيُعَدّ ما وصل لا ما حاولنا */
async function sendText(to: string, body: string): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: true } }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
