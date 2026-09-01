import { NextResponse } from "next/server";
import { partnerFromKey, log } from "@/lib/cafe/delivery-api";

/**
 * GET /api/delivery/ping — the first thing a partner tries.
 *
 * Exists so an integration engineer at the other company can prove their key
 * works before writing a line of code against anything real. Without it the
 * first test is a live orders call, and a 403 there is ambiguous: wrong key, or
 * no orders?
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const partner = await partnerFromKey(req);
  if (!partner) {
    await log("/api/delivery/ping", 403, "", "مفتاح غير معروف");
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, partner: partner.name_ar, delivery_fee: partner.delivery_fee });
}
