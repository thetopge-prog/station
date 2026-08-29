import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/calls — «الزبون يتصل الآن».
 *
 * The shop's own Android phone posts the caller's number here the moment it
 * rings (MacroDroid: trigger «مكالمة واردة» → action «HTTP Request»), and the
 * cashier screen shows who is calling before the handset is picked up. A
 * caller-ID modem on a landline can post the same body.
 *
 * Why this is worth a route: the slowest part of a phone order is not typing
 * the number, it is «شنو اسمك؟ وين عنوانك؟» — and both are already in the
 * database for anyone who has ordered before.
 *
 * AUTH: the same shared secret the WhatsApp intake uses, in `x-station-secret`,
 * compared in constant time. No session — the caller is a phone, not a person.
 * With no secret configured the route refuses everything rather than becoming
 * an open pipe for writing phone numbers into the shop's database.
 */

export const dynamic = "force-dynamic";

function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Iraqi mobile numbers arrive in several shapes depending on the handset and
 * the network: +9647701234567, 009647701234567, 07701234567. The database
 * holds the local form, so everything is folded into it — otherwise the same
 * customer is three different people and none of them has an address.
 */
export function normalizeIraqiPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("00964")) local = local.slice(5);
  else if (local.startsWith("964")) local = local.slice(3);
  if (!local.startsWith("0")) local = `0${local}`;
  // 07XXXXXXXXX — anything shorter is a withheld or malformed number
  return /^07\d{9}$/.test(local) ? local : null;
}

export async function POST(req: Request) {
  const expected = process.env.STATION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "الويب‑هوك غير مُهيّأ" }, { status: 503 });
  }
  // trimmed: this value is pasted into a phone by hand, and a trailing space
  // picked up on the way is invisible, survives every re-check, and looks
  // exactly like a wrong password
  if (!secretMatches(req.headers.get("x-station-secret")?.trim() ?? null, expected.trim())) {
    return NextResponse.json({ ok: false, error: "غير مصرّح" }, { status: 401 });
  }

  let body: { phone?: string } = {};
  try {
    body = (await req.json()) as { phone?: string };
  } catch {
    // MacroDroid can be configured to send a form body just as easily
    try {
      const form = await req.formData();
      body = { phone: String(form.get("phone") ?? "") };
    } catch {
      /* fall through to the missing-phone answer */
    }
  }

  const phone = normalizeIraqiPhone(body.phone ?? "");
  if (!phone) {
    // A withheld number is not an error worth retrying — say so plainly so the
    // phone's automation does not queue it forever.
    return NextResponse.json({ ok: false, error: "رقم غير صالح أو محجوب" }, { status: 200 });
  }

  const svc = createSupabaseServiceClient();
  const { data: customer } = await svc
    .from("customers")
    .select("id, name_ar, address")
    .eq("phone", phone)
    .maybeSingle();

  const { error } = await svc.from("incoming_calls").insert({ phone, customer_id: customer?.id ?? null });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Echoed back so the phone can show a notification even before anyone looks
  // at the till screen.
  return NextResponse.json({
    ok: true,
    phone,
    known: !!customer,
    name: customer?.name_ar ?? null,
    address: customer?.address ?? null,
  });
}
