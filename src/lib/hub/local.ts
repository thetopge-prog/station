import { businessDay } from "@/lib/cafe/time";
import type { OrderLineInput, SubmitOrderInput } from "@/lib/cafe/order-actions";
import type { PrepOrder, PrepItem } from "@/lib/cafe/prep-actions";

/**
 * Everything the hub has to decide for itself while the line is down.
 *
 * Pure on purpose — no SQLite, no network, no clock of its own. An order taken
 * during an outage is the one piece of this system with no second chance: it
 * is printed, cooked and handed over before anybody could check it against the
 * cloud. So the rules that produce it are unit-tested rather than trusted.
 */

/**
 * Same alphabet as gen_pickup_code() in 0043 — no 0/O, no 1/I/L. A code read
 * out down a phone line has to survive a bad connection and a noisy car park.
 */
export const PICKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function genPickupCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 3; i++) out += PICKUP_ALPHABET[Math.floor(rand() * PICKUP_ALPHABET.length)];
  return out;
}

/**
 * The shop's half of the number line.
 *
 * 0025 split it: the shop takes 1..899 and web delivery/pickup take 900+, so a
 * hub order and a cloud order can never land on the same
 * unique(business_day, order_seq). That split is the entire reason an offline
 * order can be replayed later keeping the number already on the receipt.
 */
export const HUB_SEQ_MIN = 1;
export const HUB_SEQ_MAX = 899;

/**
 * Next shop number after `last`.
 *
 * Wraps rather than throws at the ceiling. 899 orders in one day is a good
 * problem; refusing the 900th sale over a counter is not, and the worst case
 * of a wrap is one duplicated number that the sync function then re-allocates.
 */
export function nextSeq(last: number | null | undefined): number {
  const n = (last ?? 0) + 1;
  return n < HUB_SEQ_MIN || n > HUB_SEQ_MAX ? HUB_SEQ_MIN : n;
}

/** item id → where it is cooked and what it is called; cached while online */
export type RoutingEntry = { category_name: string | null; station_id: string | null; station_name: string | null };
export type Routing = Record<string, RoutingEntry>;
/** id → arabic name, for the two names printed on every assembly ticket */
export type NameMap = Record<string, string>;

/** A snapshot of what a menu item is called and costs, taken while online. */
export type PriceEntry = { name_ar: string; flavors: string[]; variants: Record<string, { name_ar: string }> };
export type PriceBook = Record<string, PriceEntry>;

export type LocalOrderRecord = {
  id: string;
  day: string;
  seq: number;
  createdAt: string;
  /** exactly what sync_hub_order replays; prices are recomputed cloud-side */
  lines: OrderLineInput[];
  meta: {
    channel: SubmitOrderInput["channel"];
    table: string | null;
    note: string | null;
    phone: string | null;
    address: string | null;
    customerName: string | null;
    pickupCode: string | null;
    cashierId: string | null;
    expediterId: string | null;
  };
  /** the row the kitchen and expediter screens render, resolved from the cache */
  display: PrepOrder;
};

/**
 * Turn a basket into a complete local order.
 *
 * Note what is NOT here: no price, no subtotal, no cost. The hub prints what
 * the cached menu says, but the money that reaches the books is recomputed by
 * sync_hub_order from the live menu_items — a till with a stale cache must not
 * be able to rewrite the accounts.
 */
export function buildLocalOrder({
  input,
  id,
  seq,
  now,
  routing,
  prices,
  staffNames,
  cashierId,
  expediterId,
  pickupCode,
}: {
  input: SubmitOrderInput;
  id: string;
  seq: number;
  now: Date;
  routing: Routing;
  prices: PriceBook;
  staffNames: NameMap;
  cashierId: string | null;
  expediterId: string | null;
  pickupCode: string;
}): LocalOrderRecord {
  const createdAt = now.toISOString();
  const items: PrepItem[] = input.lines.map((l, idx) => {
    const p = prices[l.item_id];
    const variant = l.variant_id ? p?.variants?.[l.variant_id] : undefined;
    const r = routing[l.item_id];
    return {
      // deterministic, so a re-render of the same order does not reshuffle keys
      id: `${id}:${idx}`,
      name_ar: (p?.name_ar ?? "صنف") + (variant ? ` - ${variant.name_ar}` : ""),
      flavor_ar: l.flavor?.trim() || null,
      qty: Math.max(1, l.qty),
      station_id: r?.station_id ?? null,
      station_name: r?.station_name ?? null,
      category_name: r?.category_name ?? null,
    };
  });

  return {
    id,
    day: businessDay(now),
    seq,
    createdAt,
    lines: input.lines,
    meta: {
      channel: input.channel,
      table: input.table?.trim() || null,
      note: input.note?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      customerName: input.name?.trim() || null,
      pickupCode,
      cashierId,
      expediterId,
    },
    display: {
      id,
      order_seq: seq,
      pickup_code: pickupCode,
      prep_status: "new",
      status: "pending",
      channel: input.channel,
      table_no: input.table?.trim() || null,
      note: input.note?.trim() || null,
      eta_minutes: null,
      created_at: createdAt,
      cashier_name: cashierId ? staffNames[cashierId] ?? null : null,
      expediter_name: expediterId ? staffNames[expediterId] ?? null : null,
      customer_phone: input.phone?.trim() || null,
      customer_name: input.name?.trim() || null,
      notified_at: null,
      items,
    },
  };
}

/**
 * Filter a local order down to one station's work, matching listPrepOrders.
 *
 * Returns null when the station has nothing in this order — the same invariant
 * the print router holds: a station with no items gets no ticket and no card
 * on its screen, because a card with an empty body is a chef walking over to
 * read nothing.
 */
export function forStation(order: PrepOrder, stationId: string | null): PrepOrder | null {
  if (!stationId) return order;
  const items = order.items.filter((i) => i.station_id === stationId);
  return items.length ? { ...order, items } : null;
}
