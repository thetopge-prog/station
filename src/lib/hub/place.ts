import { randomUUID } from "node:crypto";
import { businessDay } from "@/lib/cafe/time";
import { buildLocalOrder, genPickupCode, nextSeq } from "./local";
import { readSnapshot } from "./snapshot";
import { allocSeq, saveLocalOrder } from "./store";
import type { SubmitOrderInput, SubmitOrderResult } from "@/lib/cafe/order-actions";

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
    });

    await saveLocalOrder(rec);

    return {
      ok: true,
      orderNumber: String(seq).padStart(3, "0"),
      orderId: rec.id,
      pickupCode: rec.meta.pickupCode,
      table,
    };
  } catch (e) {
    console.error("[hub] local order failed:", e);
    return { ok: false, error: "تعذّر حفظ الطلب محلياً — راجع الكاشير." };
  }
}
