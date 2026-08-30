import QRCode from "qrcode";
import { headers } from "next/headers";
import { requireDeveloper } from "@/lib/cafe/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { SetupClient, type MappedPrinter, type ScreenLink } from "@/components/cafe/SetupClient";

export const dynamic = "force-dynamic";

/**
 * The installation page, opened on the machine being installed.
 *
 * Everything on it is READ from somewhere real: the printer map comes from the
 * database, the addresses from the browser's own URL, and the installed
 * printers from the local agent. Nothing here is a screenshot of how the shop
 * was configured once — if somebody re-routes fries tomorrow, this page says so.
 *
 * Developer only (0046). It carries no money, but it does carry the command
 * that installs software on a till — which is not a restaurant manager's job
 * even when the restaurant manager is the owner.
 */

const INSTALL = `irm https://raw.githubusercontent.com/thetopge-prog/station/main/scripts/setup-pos.ps1 -OutFile "$env:TEMP\\st-setup.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\\st-setup.ps1"`;

export default async function SetupPage() {
  await requireDeveloper();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  const origin = `${proto}://${host}`;

  const svc = createSupabaseServiceClient();
  const [{ data: printers }, { data: stations }, { data: cats }] = await Promise.all([
    svc.from("printers").select("name_ar, kind, station_id, host, share, is_active").order("sort"),
    svc.from("stations").select("id, name_ar"),
    svc.from("categories").select("name_ar, station_id, is_active"),
  ]);

  const stationName = new Map((stations ?? []).map((s) => [s.id, s.name_ar]));
  const mapped: MappedPrinter[] = (printers ?? []).map((p) => ({
    name: p.name_ar,
    kind: p.kind as MappedPrinter["kind"],
    station: p.station_id ? stationName.get(p.station_id) ?? null : null,
    // the categories that will actually land on this printer — the routing is
    // data, so this is the live answer rather than a remembered one
    categories: (cats ?? []).filter((c) => c.is_active !== false && c.station_id && c.station_id === p.station_id).map((c) => c.name_ar),
    host: p.host,
    share: p.share,
    active: p.is_active,
  }));

  /**
   * The ceiling display signs in with a key in its own URL, because nobody can
   * reach it to sign in again and a staff cookie expires in seven days. That
   * key is handed over HERE, on the developer's page, so it is never something
   * to look up in a file at the top of a ladder.
   */
  const displayKey = process.env.STATION_DISPLAY_KEY;
  const screenDefs = [
    { title: "شاشة المطبخ", note: "لكل طباخ — يرى أصناف محطته فقط", path: "/kds" },
    { title: "شاشة التجهيز", note: "هنا يُوصل قارئ الـQR", path: "/expediter" },
    {
      title: "شاشة الاستلام",
      note: displayKey
        ? "الشاشة المعلّقة — الرابط يحمل مفتاحها، تفتح بلا تسجيل دخول"
        : "⚠ لا يوجد STATION_DISPLAY_KEY — ستطلب الشاشة تسجيل دخول",
      path: displayKey ? `/queue?key=${encodeURIComponent(displayKey)}` : "/queue",
    },
    { title: "منيو الزبون", note: "التابلت على الطاولة، أو ملصق QR", path: "/menu" },
  ];
  const screens: ScreenLink[] = await Promise.all(
    screenDefs.map(async (s) => {
      const url = `${origin}${s.path}`;
      return {
        title: s.title,
        note: s.note,
        url,
        qr: await QRCode.toDataURL(url, { margin: 1, width: 300, color: { dark: "#2C1E16", light: "#ffffff" } }),
        // Turns a Windows screen into a dedicated appliance: full screen, no
        // tabs, no address bar, starts itself, never sleeps. A ceiling screen
        // showing a browser is a ceiling screen somebody will need a ladder for.
        kiosk: `irm https://raw.githubusercontent.com/thetopge-prog/station/main/scripts/setup-display.ps1 -OutFile "$env:TEMP\st-display.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\st-display.ps1" -Url "${url}"`,
      };
    }),
  );

  /**
   * What the shop's Android needs so a ringing phone reaches the till.
   *
   * The secret is handed over here for the same reason the display key is:
   * /setup is the developer's page, and the alternative is reading it out of a
   * file on a laptop while standing next to a phone.
   *
   * The address is always the public one. The automation must work when the
   * phone is on mobile data or in the kitchen's dead spot — and both the hub
   * and the website write to the same database anyway, so there is nothing to
   * gain by pointing it at a LAN address that changes when a router reboots.
   */
  const callHook = process.env.STATION_WEBHOOK_SECRET
    ? {
        url: "https://station-anbar.netlify.app/api/calls",
        header: "x-station-secret",
        secret: process.env.STATION_WEBHOOK_SECRET,
        // BOTH placeholders, one body. A call fills [number] and leaves the
        // other as literal text; an SMS does the reverse; the endpoint strips
        // non-digits, so whichever resolved is what arrives. One macro, two
        // triggers, nothing to remember.
        body: `{"secret":"${process.env.STATION_WEBHOOK_SECRET}","phone":"[number][sms_number]"}`,
        // WhatsApp calls never reach Android's telephony, but they do raise a
        // notification — that is the only handle there is.
        whatsappBody: `{"secret":"${process.env.STATION_WEBHOOK_SECRET}","phone":"[notification_title]","name":"[notification_title]"}`,
      }
    : null;

  return <SetupClient installCommand={INSTALL} printers={mapped} screens={screens} origin={origin} callHook={callHook} />;
}
