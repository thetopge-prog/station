"use server";

import { isDemoServer } from "./demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendNewOrderPush } from "./push";
import type { Json } from "@/lib/types";

export type OrderLineInput = {
  item_id: string;
  variant_id?: string | null;
  flavor?: string | null;
  qty: number;
};

/** How the customer wants the order fulfilled. Maps 1:1 onto order_channel. */
export type Fulfilment = "qr" | "kiosk" | "delivery" | "pickup" | "curbside";

export type SubmitOrderInput = {
  channel: Fulfilment;
  /** table number; the sentinel "#auto" asks the server to assign a free one */
  table?: string | null;
  lines: OrderLineInput[];
  /** optional customer capture — builds the loyalty base */
  name?: string | null;
  phone?: string | null;
  /** free-text order note («بدون مخلل، صوص إضافي…») */
  note?: string | null;
  /** delivery only — printed prominently on every ticket */
  address?: string | null;
  /** curbside only — «كيا سوداء» so the runner finds the car */
  carNote?: string | null;
  /** dine-in only — drives which table is big enough */
  guests?: number | null;
  /** what the customer will pay with at handover; no online payment exists */
  paymentPref?: "cash" | "card" | null;
};

export type SubmitOrderResult =
  | {
      ok: true;
      orderNumber: string;
      orderId?: string | null;
      cardSerial?: string | null;
      /** the «رمز الأمان» to quote at pickup / from the car */
      pickupCode?: string | null;
      /** the table the server assigned for a dine-in order */
      table?: string | null;
    }
  | { ok: false; error: string };

/** Place a self-order. Demo → a plausible number, no persistence. Real → place_order rpc.
 *  A provided phone finds-or-creates the customer (loyalty card) and attaches the
 *  order to them, so paying at the counter auto-awards their points. */
export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  if (!input.lines?.length) return { ok: false, error: "السلة فارغة" };

  if (isDemoServer()) {
    const n = Math.floor(Math.random() * 900 + 100);
    return { ok: true, orderNumber: String(n).padStart(3, "0") };
  }

  const supabase = await createSupabaseServerClient();

  let customerId: string | null = null;
  let cardSerial: string | null = null;
  const phone = input.phone?.trim();
  if (phone) {
    const { data: serial } = await supabase.rpc("create_card", {
      p_phone: phone,
      p_name: input.name?.trim() || null,
    });
    if (serial) {
      cardSerial = serial;
      const { data: card } = await supabase.rpc("get_card", { p_serial: serial });
      customerId = card?.[0]?.id ?? null;
    }
  }

  // ALL NINE arguments. This call used to pass five, so a delivery order's
  // address and phone were silently dropped on the floor and every web order
  // was filed as order_source='pos'. Anything added to place_order must be
  // threaded through here or it vanishes without an error.
  const { data, error } = await supabase.rpc("place_order", {
    p_channel: input.channel,
    p_lines: input.lines as unknown as Json,
    p_customer: customerId,
    p_table: input.table?.trim() || null,
    p_note: buildNote(input),
    p_phone: phone || null,
    p_address: input.address?.trim() || null,
    p_source: "web",
    p_customer_name: input.name?.trim() || null,
  });
  if (error || !data?.[0]) return { ok: false, error: "تعذّر إرسال الطلب، حاول مجدداً." };

  const placed = data[0];
  // alert subscribed staff devices even when the app is closed (never throws)
  await sendNewOrderPush({
    seq: placed.order_seq,
    table: input.table?.trim() || null,
    count: input.lines.reduce((s, l) => s + l.qty, 0),
  });
  return {
    ok: true,
    orderNumber: String(placed.order_seq).padStart(3, "0"),
    orderId: placed.order_id,
    pickupCode: placed.pickup_code,
    table: placed.table_no ?? null,
    cardSerial,
  };
}

/**
 * Fold the fulfilment extras into the order note.
 *
 * The car description and payment preference matter to exactly one person for
 * about a minute — the runner walking the bag out. Putting them in the note
 * means they land on every ticket and every screen that already renders notes,
 * with no new column, no schema change and no code to update in five places.
 */
function buildNote(input: SubmitOrderInput): string | null {
  const parts: string[] = [];
  if (input.note?.trim()) parts.push(input.note.trim());
  if (input.carNote?.trim()) parts.push(`🚗 ${input.carNote.trim()}`);
  if (input.guests) parts.push(`👥 ${input.guests}`);
  if (input.paymentPref) parts.push(input.paymentPref === "card" ? "💳 كي كارد" : "💵 نقدي");
  return parts.join(" · ") || null;
}

export type PublicOrderItem = { name_ar: string; flavor_ar: string | null; qty: number; unit_price: number; line_total: number };
export type PublicOrder = {
  id: string;
  order_seq: number;
  status: string;
  table_no: string | null;
  subtotal: number;
  discount: number;
  created_at: string;
  items: PublicOrderItem[];
};

/** Customer-side order tracking — looks up their own orders by unguessable id. */
export async function getMyOrders(ids: string[]): Promise<PublicOrder[]> {
  if (!ids.length || isDemoServer()) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_orders_public", { p_orders: ids.slice(0, 20) });
  return (Array.isArray(data) ? data : []) as PublicOrder[];
}
