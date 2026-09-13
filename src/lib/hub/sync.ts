import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { cloudReachable, isNetworkError, markCloudDown } from "./net";
import { refreshSnapshot } from "./snapshot";
import {
  hubEnabled,
  markOrderFailed,
  markOrderSynced,
  markPrepSent,
  pendingPreps,
  unsyncedOrders,
} from "./store";
import type { PrepStatus } from "@/lib/types";
import { openSessionIdFor } from "@/lib/cafe/session-of";
import { loyaltyConfig } from "@/lib/cafe/config";
import { earnPoints } from "@/lib/cafe/points";

/**
 * Push what the shop did while it was alone.
 *
 * Order matters: orders first, then their prep transitions. A prep update for
 * an order the cloud has never seen is a no-op that would be retried forever,
 * so the two are never interleaved.
 *
 * Every push is idempotent — the order uuid is minted in the shop and is the
 * primary key cloud-side, so a flapping connection that retries the same order
 * fifty times still books one sale. That property is worth more here than any
 * amount of retry cleverness.
 */

let running = false;

export async function drainHub(): Promise<{ orders: number; preps: number }> {
  if (!hubEnabled() || running) return { orders: 0, preps: 0 };
  if (!(await cloudReachable())) return { orders: 0, preps: 0 };

  running = true;
  let orders = 0;
  let preps = 0;
  try {
    const svc = createSupabaseServiceClient();

    for (const o of await unsyncedOrders()) {
      const { data, error } = await svc.rpc("sync_hub_order", {
        p_id: o.id,
        p_seq: o.seq,
        p_day: o.day,
        p_channel: o.meta.channel,
        p_lines: o.lines as unknown as never,
        p_created: o.created_at,
        p_table: o.meta.table,
        p_note: o.meta.note,
        p_phone: o.meta.phone,
        p_address: o.meta.address,
        p_customer_name: o.meta.customerName,
        p_code: o.meta.pickupCode,
        p_cashier: o.meta.cashierId,
        p_expediter: o.meta.expediterId,
        p_prep_status: o.prep_status as PrepStatus,
      });

      if (error) {
        // A hub that fails to sync in silence is indistinguishable from one
        // that is working; this line is how anyone finds out.
        console.error(`[hub] order ${o.id} rejected:`, error.message);
        await markOrderFailed(o.id, error.message);
        // the line went down mid-drain: stop, keep the rest queued, try later
        if (isNetworkError(error)) {
          markCloudDown();
          return { orders, preps };
        }
        continue;
      }
      // A counter sale carries its payment facts; the cloud prices the lines,
      // then this stamps status/discount/method/partner/session on top. If it
      // fails, the order stays unsynced and the next drain retries — the
      // insert is idempotent (already=true), so nothing doubles.
      const pay = o.meta.pay;
      if (pay) {
        const session = o.meta.cashierId ? await openSessionIdFor(o.meta.cashierId).catch(() => null) : null;
        const { data: net, error: payErr } = await svc.rpc("sync_hub_payment", {
          p_id: o.id,
          p_paid_at: pay.paidAt,
          p_discount: pay.discount,
          p_extra: pay.extra,
          p_extra_note: pay.extraNote,
          p_method: pay.payMethod,
          p_partner: pay.partnerId,
          p_partner_cash: pay.partnerCashReceived,
          p_customer: pay.customerId,
          p_session: session,
        });
        if (payErr) {
          console.error(`[hub] payment ${o.id} rejected:`, payErr.message);
          await markOrderFailed(o.id, payErr.message);
          if (isNetworkError(payErr)) {
            markCloudDown();
            return { orders, preps };
          }
          continue;
        }
        // points as payOrder would have awarded, on the cloud's net figure
        const award = pay.customerId ? earnPoints(Number(net) || 0, loyaltyConfig().pointsPerIqd) : 0;
        if (award > 0) {
          const { error: le } = await svc.from("loyalty_events").insert({ customer_id: pay.customerId!, order_id: o.id, delta: award, reason: "earn_order" });
          // 23505 = the partial unique index: already awarded on a previous pass
          if (le && !/23505|duplicate/i.test(le.message)) console.error(`[hub] points ${o.id}:`, le.message);
        }
      }
      await markOrderSynced(o.id, data?.[0]?.order_seq ?? o.seq);
      orders++;
    }

    for (const p of await pendingPreps()) {
      const { error } = await svc.rpc("sync_hub_prep", {
        p_id: p.order_id,
        p_status: p.status as PrepStatus,
        p_at: p.at,
      });
      if (error) {
        console.error(`[hub] prep ${p.order_id} rejected:`, error.message);
        if (isNetworkError(error)) {
          markCloudDown();
          return { orders, preps };
        }
        continue;
      }
      await markPrepSent(p.order_id);
      preps++;
    }
  } catch (e) {
    // never let a background push take a request thread down with it
    console.error("[hub] drain failed:", e);
  } finally {
    running = false;
  }
  return { orders, preps };
}

/** How often we look for a line and push. Fast enough that a brief blip is invisible. */
const TICK_MS = 20_000;
/** Reference data changes on the scale of days; there is no point asking often. */
const SNAPSHOT_EVERY = 15;

let started = false;

/**
 * Start the background loop. Called once from instrumentation.ts.
 *
 * unref() so the timer never keeps the process alive on its own — a hub that
 * refuses to shut down is a hub somebody unplugs.
 */
export function startHubWorker(): void {
  if (!hubEnabled() || started) return;
  started = true;

  let ticks = 0;
  const timer = setInterval(() => {
    void (async () => {
      if (ticks % SNAPSHOT_EVERY === 0) await refreshSnapshot();
      ticks++;
      await drainHub();
    })();
  }, TICK_MS);
  timer.unref?.();

  // first pass immediately, so a hub started after an outage catches up now
  void (async () => {
    await refreshSnapshot();
    await drainHub();
  })();
}
