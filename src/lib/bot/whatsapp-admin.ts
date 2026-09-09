import "server-only";

/**
 * اشتراك حساب واتساب في التطبيق.
 *
 * حقل `messages` في لوحة Meta يشترك التطبيقَ في نوع الحدث، لا الحسابَ في
 * التطبيق. حساب أُنشئ تحت تطبيق آخر يبقى صامتاً حتى يُنادى
 * POST /{WABA}/subscribed_apps — وهو ما لم تفعله اللوحة رغم علامة الصحّ.
 *
 * يُستدعى من /setup على كل تحميل: يقرأ، وإن لم يجد التطبيق مشتركاً اشترك.
 * التكرار بلا أثر، والرمز يبقى على الخادم.
 */
const GRAPH = "https://graph.facebook.com/v21.0";
// معرّف حساب الاختبار — ليس سرّاً، ويُستبدل بمتغيّر عند الانتقال لحساب المطعم
const WABA = () => (process.env.WHATSAPP_WABA_ID ?? "1570721767741303").trim();
const TOKEN = () => (process.env.WHATSAPP_TOKEN ?? "").trim();

export type WabaSubscription = { ok: boolean; detail: string };

export async function ensureWabaSubscribed(): Promise<WabaSubscription> {
  if (!TOKEN()) return { ok: false, detail: "لا WHATSAPP_TOKEN" };
  try {
    const list = await fetch(`${GRAPH}/${WABA()}/subscribed_apps`, {
      headers: { authorization: `Bearer ${TOKEN()}` },
      cache: "no-store",
    }).then((r) => r.json() as Promise<{ data?: { whatsapp_business_api_data?: { id: string; name: string } }[]; error?: { message: string } }>);
    if (list.error) return { ok: false, detail: `قراءة الاشتراك: ${list.error.message}` };
    const apps = (list.data ?? []).map((d) => d.whatsapp_business_api_data?.name ?? "?");
    if (apps.length) return { ok: true, detail: `مشترك: ${apps.join("، ")}` };

    const sub = await fetch(`${GRAPH}/${WABA()}/subscribed_apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN()}` },
      cache: "no-store",
    }).then((r) => r.json() as Promise<{ success?: boolean; error?: { message: string } }>);
    if (sub.error) return { ok: false, detail: `الاشتراك رُفض: ${sub.error.message}` };
    return { ok: Boolean(sub.success), detail: sub.success ? "اشتُرك الآن — أرسل رسالة للتجربة" : "لم يُقبل الاشتراك" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "تعذّر الوصول إلى Meta" };
  }
}
