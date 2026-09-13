import { randomUUID } from "node:crypto";
import { businessDay } from "@/lib/cafe/time";
import { buildLocalOrder, genPickupCode, nextSeq } from "./local";
import { readSnapshot } from "./snapshot";
import { allocSeq, saveLocalOrder } from "./store";
import type { SubmitOrderInput, SubmitOrderResult } from "@/lib/cafe/order-actions";
import type { CheckoutResult } from "@/lib/cafe/cashier-actions";
import type { LocalOrderRecord, LocalPay } from "./local";

/**
 * Take an order with no line to the cloud.
 *
 * The uuid is minted here, and that single decision is what makes the whole
 * offline path safe: it is the primary key cloud-side, so replaying this order
 * any number of times books exactly one sale.
 */
export async function placeLocalOrder(
  input: SubmitOrderInput,
  cashierId: string | null,
): Promise<SubmitOrderResult> {
  const r = await takeLocally(input, cashierId, null);
  if (!r.ok) return r;
  return { ok: true, orderNumber: r.orderNumber, orderId: r.id, pickupCode: r.pickupCode, table: r.table };
}

/**
 * A counter sale with no line: saved paid, printed, replayed later with its
 * payment facts (sync_hub_payment). The till's total is from the cached prices;
 * the books get the cloud's figure when it syncs.
 */
export async function placeLocalSale(
  input: Omit<SubmitOrderInput, "channel"> & { channel: "cashier" | "takeaway" },
  cashierId: string,
  pay: Omit<LocalPay, "paidAt" | "subtotal">,
): Promise<CheckoutResult> {
  const r = await takeLocally(input, cashierId, pay);
  if (!r.ok) return r;
  return {
    ok: true,
    orderId: r.id,
    orderNumber: r.orderNumber,
    pickupCode: r.pickupCode,
    total: r.total,
    awarded: 0,
    warning: "الخط مقطوع — حُفظ البيع على جهاز المحل ويُرفع تلقائياً حين يعود.",
  };
}

async function takeLocally(
  input: Omit<SubmitOrderInput, "channel"> & { channel: LocalOrderRecord["meta"]["channel"] },
  cashierId: string | null,
  pay: Omit<LocalPay, "paidAt" | "subtotal"> | null,
): Promise<{ ok: true; id: string; orderNumber: string; pickupCode: string | null; table: string | null; total: number } | { ok: false; error: string }> {
  try {
    const now = new Date();
    const day = businessDay(now);
    const [seq, snap] = await Promise.all([allocSeq(day, nextSeq), readSnapshot()]);

    // «#auto» asks the database to find a free table under a lock. With no
    // database there is nothing to lock and no way to know which tables are
    // taken, so the honest answer is to say who decides instead of guessing.
    const auto = input.table?.trim() === "#auto";
    const table = auto ? null : input.table?.trim() || null;
    const note = auto
      ? [input.note?.trim(), "🪑 الطاولة يحددها الكاشير"].filter(Boolean).join(" · ")
      : input.note ?? null;

    const rec = buildLocalOrder({
      input: { ...input, table, note },
      id: randomUUID(),
      seq,
      now,
      routing: snap.routing,
      prices: snap.prices,
      staffNames: snap.names,
      cashierId,
      expediterId: snap.expediterId,
      pickupCode: genPickupCode(),
      pay,
    });

    await saveLocalOrder(rec);

    const p = rec.meta.pay;
    return {
      ok: true,
      id: rec.id,
      orderNumber: String(seq).padStart(3, "0"),
      pickupCode: rec.meta.pickupCode,
      table,
      total: p ? Math.max(0, p.subtotal - p.discount + p.extra) : 0,
    };
  } catch (e) {
    console.error("[hub] local order failed:", e);
    return { ok: false, error: "تعذّر حفظ الطلب محلياً — راجع الكاشير." };
  }
}
