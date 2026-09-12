import QRCode from "qrcode";
import { headers } from "next/headers";
import { requireDeveloper } from "@/lib/cafe/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { SetupClient, type ScreenLink, type SetupPrinter } from "@/components/cafe/SetupClient";
import { ensureWabaSubscribed } from "@/lib/bot/whatsapp-admin";

/**
 * /setup — التركيب.
 *
 * أربعة أقسام، كل واحد فعلٌ لا شرح: شغّل السكربت · اربط الطابعات · افتح
 * الشاشات · جرّب الدرج. وكل ما فيه **مقروء من مصدر حقيقي** — الطابعات من
 * القاعدة، والعناوين من عنوان المتصفح نفسه، والمكتشَف من الوكيل المحلي. فلا
 * سطر هنا يصف كيف رُكّب المحل مرّةً؛ إن غيّرتَ شيئاً غداً قالته الصفحة.
 *
 * للمطوّر وحده (0046): لا مال فيها، لكن فيها الأمر الذي يُنصّب برنامجاً على
 * جهاز — وذلك ليس عمل مدير مطعم حتى لو كان المدير هو المالك.
 */
export const dynamic = "force-dynamic";

const INSTALL = `irm https://raw.githubusercontent.com/thetopge-prog/station/main/scripts/setup-pos.ps1 -OutFile "$env:TEMP\\st-setup.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\st-setup.ps1"`;
const HUB_INSTALL = `irm https://raw.githubusercontent.com/thetopge-prog/station/main/scripts/setup-hub.ps1 -OutFile "$env:TEMP\\st-hub.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\st-hub.ps1"`;

export default async function SetupPage() {
  await requireDeveloper();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  const origin = `${proto}://${host}`;

  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("printers")
    .select("id, name_ar, kind, share, host, is_active, sort, stations(name_ar)")
    .order("sort");

  const rows = (data ?? []) as unknown as (SetupPrinter & { stations: { name_ar: string } | null })[];
  const printers: SetupPrinter[] = rows.map((p) => ({
    id: p.id,
    name_ar: p.name_ar,
    kind: p.kind,
    station_name: p.stations?.name_ar ?? null,
    share: p.share,
    host: p.host,
    is_active: p.is_active,
  }));

  /*
   * مفتاح الشاشة يُسلَّم هنا، على صفحة المطوّر — لا يُبحث عنه في ملف وأنت
   * أعلى السلّم. و /tv/<key> لا /queue?key= لأن هذا العنوان يُكتب بريموت
   * تلفزيون، وكل رمز فيه صفحة لوحة مفاتيح.
   */
  const displayKey = process.env.STATION_DISPLAY_KEY;
  const defs = [
    { title: "شاشة المطبخ", note: "لكل طبّاخ — يرى أصناف محطته فقط", path: "/kds" },
    { title: "شاشة التجهيز", note: "هنا يُوصل قارئ الـQR", path: "/expediter" },
    {
      title: "شاشة الاستلام",
      note: displayKey ? "المعلّقة — تفتح بلا تسجيل دخول" : "⚠ لا يوجد STATION_DISPLAY_KEY",
      path: displayKey ? `/tv/${encodeURIComponent(displayKey)}` : "/queue",
    },
    { title: "منيو الزبون", note: "التابلت على الطاولة، أو ملصق QR", path: "/menu" },
  ];
  const screens: ScreenLink[] = await Promise.all(
    defs.map(async (s) => {
      const url = `${origin}${s.path}`;
      return { ...s, url, qr: await QRCode.toDataURL(url, { width: 220, margin: 1 }) };
    }),
  );

  // كلمة سرّ الجهاز — نفس منطق مفتاح الشاشة أعلاه: تُسلَّم هنا للمطوّر، لا تُبحث
  // عنها في ملف بيئة على خادم. وهي كلمة الويبهوك التي يقبلها /api/calls و /api/orders/external.
  const webhookSecret = process.env.STATION_WEBHOOK_SECRET ?? null;

  // بوت واتساب: العنوان الذي تُلصقه في Meta، والكلمة التي تتحقّق بها من أنه نحن
  const whatsapp = {
    url: `${origin}/api/whatsapp/webhook`,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
    ready: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
    // الحساب مشترك في التطبيق؟ يُقرأ من Meta ويُصلَح إن لزم — علامة الصحّ في لوحتهم لا تكفي
    subscription: await ensureWabaSubscribed(),
  };

  return <SetupClient printers={printers} screens={screens} installCommand={INSTALL}
      hubCommand={HUB_INSTALL} webhookSecret={webhookSecret} whatsapp={whatsapp} />;
}
