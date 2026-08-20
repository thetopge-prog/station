import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

/**
 * POST /api/orders/whatsapp — intake channel #3.
 *
 * Prepared for a future WhatsApp bot. The bot owns the conversation; this
 * endpoint owns turning a finished basket into a real order that appears on the
 * customer display, the KDS and the expediter screen exactly like a POS sale.
 *
 * Deliberately name-based, not id-based: a bot talking to a customer has
 * «برجر كلاسيك», not a UUID. Resolving names here means the bot never has to
 * know the menu's primary keys, and an unknown name fails loudly instead of
 * silently dropping a line from someone's dinner.
 *
 * AUTH: a shared secret in `x-station-secret`, compared in constant time.
 * There is no user session — the caller is a server, not a person. Without
 * STATION_WEBHOOK_SECRET set, the route refuses every request rather than
 * defaulting open.
 *
 * Money is never taken from the request. place_order recomputes every price
 * from the menu server-side, so a malformed or hostile payload cannot set its
 * own prices.
 */

export const dynamic = "force-dynamic";

type IncomingLine = {
  /** menu_items.name_ar, matched case/space-insensitively */
  name?: string;
  item_id?: string;
  variant?: string;
  flavor?: string;
  qty?: number;
};

type IncomingOrder = {
  channel?: "delivery" | "pickup";
  customer_name?: string;
  phone?: string;
  address?: string;
  note?: string;
  lines?: IncomingLine[];
};

/** Length-safe, constant-time-ish comparison so a wrong secret leaks nothing. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export async function POST(req: Request) {
  const expected = process.env.STATION_WEBHOOK_SECRET;
  if (!expected) {
    // fail closed: an unconfigured webhook must not become an open order pipe
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("x-station-secret"), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: IncomingOrder;
  try {
    body = (await req.json()) as IncomingOrder;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const incoming = (body.lines ?? []).filter((l) => (l.name || l.item_id) && (l.qty ?? 1) > 0);
  if (!incoming.length) {
    return NextResponse.json({ error: "empty order" }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();

  // resolve names → ids against the ACTIVE menu only, so a retired item can
  // never be ordered by a bot working from a stale script
  const { data: menu } = await svc.from("menu_items").select("id, name_ar").eq("is_active", true);
  const byName = new Map((menu ?? []).map((m) => [norm(m.name_ar), m.id]));

  const { data: variants } = await svc.from("item_variants").select("id, item_id, name_ar").eq("is_active", true);

  const lines: { item_id: string; variant_id: string | null; flavor: string | null; qty: number }[] = [];
  const unknown: string[] = [];

  for (const l of incoming) {
    const itemId = l.item_id ?? (l.name ? byName.get(norm(l.name)) : undefined);
    if (!itemId) {
      unknown.push(l.name ?? l.item_id ?? "?");
      continue;
    }
    const variantId = l.variant
      ? (variants ?? []).find((v) => v.item_id === itemId && norm(v.name_ar) === norm(l.variant!))?.id ?? null
      : null;
    lines.push({
      item_id: itemId,
      variant_id: variantId,
      flavor: l.flavor?.trim() || null,
      qty: Math.max(1, Math.round(l.qty ?? 1)),
    });
  }

  // All-or-nothing: half an order reaching the kitchen is worse than none,
  // because nobody downstream can tell that something is missing.
  if (unknown.length) {
    return NextResponse.json({ error: "unknown items", items: unknown }, { status: 422 });
  }

  const channel = body.channel === "pickup" ? "pickup" : "delivery";
  const { data, error } = await svc.rpc("place_order", {
    p_channel: channel,
    p_lines: lines as unknown as Json,
    p_customer: null,
    p_table: null,
    p_note: body.note?.trim() || null,
    p_phone: body.phone?.trim() || null,
    p_address: body.address?.trim() || null,
    p_source: "whatsapp",
    p_customer_name: body.customer_name?.trim() || null,
  });

  if (error || !data?.[0]) {
    return NextResponse.json({ error: error?.message ?? "could not place order" }, { status: 500 });
  }

  const placed = data[0];
  return NextResponse.json({
    ok: true,
    order_id: placed.order_id,
    order_number: String(placed.order_seq).padStart(3, "0"),
    pickup_code: placed.pickup_code,
    // the bot echoes this back to the customer; the kitchen has no ETA model
    // yet, so it is a promise the shop can keep rather than a guess
    eta_minutes: 15,
  });
}

/** Health probe for whoever wires the bot up. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "station/whatsapp-intake",
    configured: Boolean(process.env.STATION_WEBHOOK_SECRET),
  });
}
