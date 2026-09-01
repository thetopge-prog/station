import { NextResponse } from "next/server";
import { partnerFromKey, log } from "@/lib/cafe/delivery-api";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/delivery/orders — what this company has to collect.
 *
 * Only orders billed to the caller's own partner, so two companies sharing this
 * endpoint can never read each other's work. `since` lets them poll cheaply;
 * without it they get the last six hours, which is a shift.
 *
 * No money is accepted here and none ever will be — the totals we send are the
 * ones we computed. Same rule as the WhatsApp intake.
 */
export const dynamic = "force-dynamic";

const WINDOW_HOURS = 6;

export async function GET(req: Request) {
  const partner = await partnerFromKey(req);
  if (!partner) {
    log("/api/delivery/orders", 403, "", "مفتاح غير معروف");
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 403 });
  }

  const since =
    new URL(req.url).searchParams.get("since") ??
    new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();

  const svc = createSupabaseServiceClient();
  const { data: orders, error } = await svc
    .from("orders")
    // One string literal, not a concatenation: the client infers the row type
    // from the literal, and a joined string types every column as an error.
    .select("id, order_seq, pickup_code, status, prep_status, subtotal, discount, extra, customer_name, customer_phone, address_note, note, created_at, courier_requested_at, courier_ref")
    .eq("partner_id", partner.id)
    .neq("status", "cancelled")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    log("/api/delivery/orders", 500, error.message, "فشل القراءة");
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (orders ?? []).map((o) => o.id);
  const { data: items } = ids.length
    ? await svc.from("order_items").select("order_id, name_ar, flavor_ar, qty, unit_price").in("order_id", ids)
    : { data: [] };

  const byOrder = new Map<string, { name: string; qty: number; price: number }[]>();
  for (const i of items ?? []) {
    const arr = byOrder.get(i.order_id) ?? [];
    arr.push({ name: i.flavor_ar ? `${i.name_ar} — ${i.flavor_ar}` : i.name_ar, qty: i.qty, price: i.unit_price });
    byOrder.set(i.order_id, arr);
  }

  log("/api/delivery/orders", 200, "", `${orders?.length ?? 0} طلب لـ${partner.name_ar}`);

  return NextResponse.json({
    ok: true,
    partner: partner.name_ar,
    count: orders?.length ?? 0,
    orders: (orders ?? []).map((o) => ({
      id: o.id,
      // the number the shop and the customer both say out loud
      number: String(o.order_seq).padStart(3, "0"),
      pickup_code: o.pickup_code,
      status: o.status,
      kitchen: o.prep_status,
      total: +o.subtotal - +o.discount + +o.extra,
      customer: { name: o.customer_name, phone: o.customer_phone, address: o.address_note },
      note: o.note,
      placed_at: o.created_at,
      courier_requested_at: o.courier_requested_at,
      courier_ref: o.courier_ref,
      items: byOrder.get(o.id) ?? [],
    })),
  });
}
