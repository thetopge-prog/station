import { NextResponse } from "next/server";
import { partnerFromKey, log } from "@/lib/cafe/delivery-api";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/delivery/orders/{id}/courier — the company tells us what its rider did.
 *
 * Body: { "ref": "their order number", "status": "assigned|picked|delivered" }
 *
 * Deliberately does not move OUR order's state. Their rider collecting a bag is
 * not the same fact as our expediter handing it over, and collapsing the two
 * would let a company's API mark food delivered that never left the counter.
 * We record what they said, next to what we know.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const partner = await partnerFromKey(req);
  if (!partner) {
    await log("/api/delivery/courier", 403, "", "مفتاح غير معروف");
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const raw = await req.text();
  let body: { ref?: string; status?: string } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    /* a partner sending nothing at all still means "a rider is on it" */
  }

  const svc = createSupabaseServiceClient();
  // Scoped to THIS partner's own orders: an id from another company's response
  // must not become a write on somebody else's order.
  const { data: order } = await svc
    .from("orders")
    .select("id, order_seq")
    .eq("id", id)
    .eq("partner_id", partner.id)
    .maybeSingle();

  if (!order) {
    await log("/api/delivery/courier", 404, raw, `طلب ليس لـ${partner.name_ar}`);
    return NextResponse.json({ ok: false, error: "order not found for this partner" }, { status: 404 });
  }

  const { error } = await svc
    .from("orders")
    .update({
      courier_requested_at: new Date().toISOString(),
      courier_ref: (body.ref ?? body.status ?? "").toString().trim().slice(0, 80) || null,
    })
    .eq("id", order.id);

  if (error) {
    await log("/api/delivery/courier", 500, raw, error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await log("/api/delivery/courier", 200, raw, `مندوب لطلب #${order.order_seq} — ${partner.name_ar}`);
  return NextResponse.json({ ok: true, number: String(order.order_seq).padStart(3, "0") });
}
