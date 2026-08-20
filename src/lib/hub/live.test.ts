import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * The real thing, against the real database. Opt-in:
 *
 *   HUB_LIVE=1 npx vitest run src/lib/hub/live.test.ts
 *
 * Skipped by default so `npm test` stays offline and deterministic. It exists
 * because everything else about the hub is unit-tested in isolation, and the
 * one thing units cannot prove is that sync_hub_order and the code that calls
 * it agree on argument names, types and order — which is exactly where an
 * outage's worth of orders would quietly vanish.
 *
 * Cleans up after itself: every row it writes is deleted at the end.
 */

const LIVE = process.env.HUB_LIVE === "1";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadEnv() {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch {
    /* CI has real env vars */
  }
}

describe.skipIf(!LIVE)("hub → cloud, for real", () => {
  let store: typeof import("./store");
  let sync: typeof import("./sync");
  let net: typeof import("./net");
  let svc: ReturnType<typeof import("@/lib/supabase/server").createSupabaseServiceClient>;
  let itemId: string;
  const orderId = randomUUID();
  const day = "2031-01-01"; // far future: cannot collide with a real trading day

  beforeAll(async () => {
    loadEnv();
    process.env.STATION_HUB = "1";
    process.env.STATION_HUB_DB = join(tmpdir(), `station-hub-live-${process.pid}.db`);
    store = await import("./store");
    sync = await import("./sync");
    net = await import("./net");
    const server = await import("@/lib/supabase/server");
    svc = server.createSupabaseServiceClient();

    const { data } = await svc.from("menu_items").select("id").eq("is_active", true).limit(1);
    itemId = data![0].id;
  });

  it("finds the cloud before we pretend it is gone", async () => {
    expect(await net.cloudReachable()).toBe(true);
  });

  it("takes an order with the line down", async () => {
    const { refreshSnapshot } = await import("./snapshot");
    expect(await refreshSnapshot()).toBe(true);

    net.markCloudDown();
    expect(await net.cloudReachable()).toBe(false);

    const { buildLocalOrder, genPickupCode } = await import("./local");
    const snap = await (await import("./snapshot")).readSnapshot();
    const rec = buildLocalOrder({
      input: { channel: "qr", table: "9", lines: [{ item_id: itemId, qty: 2 }], note: "اختبار الهَب" },
      id: orderId,
      seq: 777,
      now: new Date(`${day}T12:00:00.000Z`),
      routing: snap.routing,
      prices: snap.prices,
      staffNames: snap.names,
      cashierId: null,
      expediterId: null,
      pickupCode: genPickupCode(),
    });
    await store.saveLocalOrder({ ...rec, day });

    expect((await store.liveLocalOrders()).some((o) => o.id === orderId)).toBe(true);
    expect((await store.backlog()).orders).toBeGreaterThan(0);
  });

  it("pushes it the moment the line returns, keeping the printed number", async () => {
    await sync.drainHub(); // still marked down → must do nothing
    expect((await store.unsyncedOrders()).some((o) => o.id === orderId)).toBe(true);

    // the "down" verdict is cached for 5s; wait it out rather than reaching
    // into the module to reset it — the timing is part of what is under test
    await new Promise((r) => setTimeout(r, 5_100));
    expect(await net.cloudReachable()).toBe(true);

    const pushed = await sync.drainHub();
    expect(pushed.orders).toBeGreaterThan(0);

    const { data } = await svc
      .from("orders")
      .select("id, order_seq, business_day, subtotal, source, prep_status")
      .eq("id", orderId)
      .single();

    expect(data).toBeTruthy();
    expect(data!.order_seq).toBe(777); // the number on the customer's receipt
    expect(data!.source).toBe("hub");
    expect(data!.subtotal).toBeGreaterThan(0); // priced cloud-side, not by the till
  }, 20_000);

  it("books one sale however many times it is replayed", async () => {
    // a flapping connection retries constantly; a double-inserted order is a
    // double-counted sale that nobody notices until the Z-report disagrees
    await store.markOrderFailed(orderId, "pretend the ack was lost");
    const db = await import("./store");
    await sync.drainHub();
    await sync.drainHub();

    const { count } = await svc.from("orders").select("id", { count: "exact", head: true }).eq("id", orderId);
    expect(count).toBe(1);

    const { data: items } = await svc.from("order_items").select("id, qty").eq("order_id", orderId);
    expect(items).toHaveLength(1);
    expect(items![0].qty).toBe(2);
    expect(db).toBeTruthy();
  });

  it("carries a prep change that happened offline", async () => {
    await store.setLocalPrep(orderId, "ready", new Date().toISOString());
    await store.queuePrep(orderId, "ready", new Date().toISOString());
    await sync.drainHub();

    const { data } = await svc.from("orders").select("prep_status").eq("id", orderId).single();
    expect(data!.prep_status).toBe("ready");
    expect((await store.pendingPreps()).some((p) => p.order_id === orderId)).toBe(false);
  });

  it("leaves nothing behind", async () => {
    await svc.from("order_items").delete().eq("order_id", orderId);
    await svc.from("orders").delete().eq("id", orderId);
    await svc.from("order_counters").delete().eq("business_day", day);
    const { count } = await svc.from("orders").select("id", { count: "exact", head: true }).eq("id", orderId);
    expect(count).toBe(0);
  });
});
