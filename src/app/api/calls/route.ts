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
 * AUTH: the same shared secret the WhatsApp intake uses, compared in constant
 * time. No session — the caller is a phone, not a person. With no secret
 * configured the route refuses everything rather than becoming an open pipe for
 * writing phone numbers into the shop's database.
 *
 * The secret is accepted in the `x-station-secret` HEADER or in the BODY as
 * `secret`. The header is the tidier of the two, but a header tab on an Android
 * automation app is a separate screen with its own name and value fields, and
 * getting it subtly wrong produces a clean 401 that looks exactly like a wrong
 * password. The body is one field the operator has already filled correctly.
 *
 * In the body it is still a POST over TLS — not a query string, so it does not
 * land in an access log, a proxy cache or a browser history the way ?secret=
 * would.
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

  // Read the body BEFORE the auth check, because the secret may be in it.
  // Nothing here touches the database, so an unauthenticated caller still gets
  // no further than parsing their own request.
  const raw = await req.text();
  let body: { phone?: string; secret?: string } = {};
  try {
    body = JSON.parse(raw) as { phone?: string; secret?: string };
  } catch {
    // Typed on a phone keyboard, which likes to turn " into “ ” — and then the
    // whole payload is unparseable JSON for a reason invisible on screen. Pull
    // the two fields out of the raw text rather than reject a request whose
    // meaning is perfectly clear.
    body = {
      secret: raw.match(/secret["'“”\s:]+([A-Za-z0-9]+)/i)?.[1],
      phone: raw.match(/phone["'“”\s:]+([+0-9][0-9\s-]*)/i)?.[1],
    };
  }

  // Trimmed on both sides: this value is pasted into a phone by hand, and a
  // trailing space picked up on the way is invisible, survives every re-check,
  // and looks exactly like a wrong password.
  // BOTH places are checked, not the header first and the body only if the
  // header is absent. A stale wrong header left over from an earlier attempt
  // would otherwise beat a perfectly correct body and report the same 403 —
  // which is exactly what happened on the shop's phone, three times.
  const candidates = [req.headers.get("x-station-secret"), body.secret]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);
  // Two different failures, two different codes. An automation app shows the
  // operator a status number and nothing else, so 401 and 403 are the only
  // diagnosis available from the far end of the country:
  //   401 — no secret arrived at all (empty body, wrong tab, nothing sent)
  //   403 — a secret arrived and does not match (wrong value)
  if (!candidates.length) {
    return NextResponse.json({ ok: false, error: "لم تصل كلمة السر إطلاقاً" }, { status: 401 });
  }
  if (!candidates.some((c) => secretMatches(c, expected.trim()))) {
    return NextResponse.json({ ok: false, error: "كلمة السر وصلت لكنها غير مطابقة" }, { status: 403 });
  }

  const phone = normalizeIraqiPhone(body.phone ?? "");
  if (!phone) {
    // 422, not 200. The automation app shows the operator a status number and
    // nothing else, and «authorised but no usable number» looked identical to
    // «recorded» — which is a test that appears to pass while the database
    // stays empty. Still not a retryable error: a withheld number will not
    // become valid on a second attempt.
    return NextResponse.json({ ok: false, error: "رقم غير صالح أو محجوب" }, { status: 422 });
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
