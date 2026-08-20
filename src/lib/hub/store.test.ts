import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { nextSeq, type LocalOrderRecord } from "./local";

/**
 * The store is I/O, so it gets an integration test rather than a unit one: a
 * real SQLite file, opened the way the hub opens it. These are the rules that
 * decide whether a customer's order survives an outage, and none of them are
 * worth trusting to a mock.
 */

const DB = join(tmpdir(), `station-hub-test-${process.pid}.db`);

let store: typeof import("./store");

beforeAll(async () => {
  process.env.STATION_HUB = "1";
  process.env.STATION_HUB_DB = DB;
  store = await import("./store");
});

afterAll(() => {
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) {
    try {
      rmSync(f);
    } catch {
      /* the WAL files may not exist */
    }
  }
});

function order(id: string, seq: number, createdAt: string): LocalOrderRecord {
  return {
    id,
    day: "2026-08-20",
    seq,
    createdAt,
    lines: [{ item_id: "fries1", qty: 1 }],
    meta: {
      channel: "qr", table: "3", note: null, phone: null, address: null,
      customerName: null, pickupCode: "K7M", cashierId: "emp1", expediterId: "emp2",
    },
    display: {
      id, order_seq: seq, pickup_code: "K7M", prep_status: "new", status: "pending",
      channel: "qr", table_no: "3", note: null, eta_minutes: null, created_at: createdAt,
      cashier_name: "أحمد", expediter_name: "سيف", customer_phone: null,
      customer_name: null, notified_at: null,
      items: [{ id: `${id}:0`, name_ar: "الويدجز", flavor_ar: null, qty: 1, station_id: "st-grill", station_name: "الشواية", category_name: "فرايس" }],
    },
  };
}

describe("the shop's order counter", () => {
  it("hands out consecutive numbers and remembers them across calls", async () => {
    expect(await store.allocSeq("2026-01-01", nextSeq)).toBe(1);
    expect(await store.allocSeq("2026-01-01", nextSeq)).toBe(2);
    expect(await store.allocSeq("2026-01-02", nextSeq)).toBe(1); // a new day starts over
  });

  it("carries on from the last number the cloud gave out", async () => {
    // the failure this prevents: line drops, hub restarts at 1, and two
    // customers walk away holding a receipt with the same number on it
    await store.noteCloudSeq("2026-02-01", 57);
    expect(await store.allocSeq("2026-02-01", nextSeq)).toBe(58);
  });

  it("ignores web numbers, which are not on the shop's half of the line", async () => {
    await store.noteCloudSeq("2026-03-01", 12);
    await store.noteCloudSeq("2026-03-01", 934); // delivery order, 900+ band
    expect(await store.allocSeq("2026-03-01", nextSeq)).toBe(13);
  });

  it("never moves the counter backwards", async () => {
    await store.noteCloudSeq("2026-04-01", 80);
    await store.noteCloudSeq("2026-04-01", 20);
    expect(await store.allocSeq("2026-04-01", nextSeq)).toBe(81);
  });
});

describe("orders taken offline", () => {
  it("shows on the kitchen board and waits to be pushed", async () => {
    await store.saveLocalOrder(order("o-1", 10, "2026-08-20T10:00:00.000Z"));

    expect((await store.liveLocalOrders()).map((o) => o.id)).toContain("o-1");
    expect((await store.unsyncedOrders()).map((o) => o.id)).toContain("o-1");
    expect(await store.isLocalOrder("o-1")).toBe(true);
    expect(await store.isLocalOrder("not-ours")).toBe(false);
  });

  it("stops being pushed once the cloud has it, but stays on the board", async () => {
    await store.markOrderSynced("o-1", 10);
    expect((await store.unsyncedOrders()).map((o) => o.id)).not.toContain("o-1");
    // the kitchen is still cooking it — syncing is a bookkeeping event, not a
    // reason for a card to vanish mid-rush
    expect((await store.liveLocalOrders()).map((o) => o.id)).toContain("o-1");
  });

  it("leaves the board once it is handed over", async () => {
    await store.setLocalPrep("o-1", "handed", "2026-08-20T10:20:00.000Z");
    expect((await store.liveLocalOrders()).map((o) => o.id)).not.toContain("o-1");
  });

  it("reports the live status, not the one frozen in the saved snapshot", async () => {
    await store.saveLocalOrder(order("o-2", 11, "2026-08-20T11:00:00.000Z"));
    await store.setLocalPrep("o-2", "ready", "2026-08-20T11:05:00.000Z");
    const row = (await store.liveLocalOrders()).find((o) => o.id === "o-2")!;
    expect(row.display.prep_status).toBe("ready");
  });

  it("keeps the board in the order the orders arrived", async () => {
    await store.saveLocalOrder(order("o-3", 12, "2026-08-20T09:00:00.000Z"));
    const ids = (await store.liveLocalOrders()).map((o) => o.id);
    expect(ids.indexOf("o-3")).toBeLessThan(ids.indexOf("o-2"));
  });
});

describe("prep transitions waiting to go up", () => {
  it("keeps one row per order — only the latest status matters", async () => {
    // replaying new→preparing→ready would be three round trips to reach the
    // state one row already describes; 0025 settled that this is last-writer-wins
    await store.queuePrep("o-9", "preparing", "2026-08-20T10:00:00.000Z");
    await store.queuePrep("o-9", "ready", "2026-08-20T10:03:00.000Z");

    const pending = (await store.pendingPreps()).filter((p) => p.order_id === "o-9");
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("ready");
  });

  it("re-queues an order that moves again after it was pushed", async () => {
    await store.markPrepSent("o-9");
    expect((await store.pendingPreps()).map((p) => p.order_id)).not.toContain("o-9");

    await store.queuePrep("o-9", "handed", "2026-08-20T10:10:00.000Z");
    expect((await store.pendingPreps()).map((p) => p.order_id)).toContain("o-9");
  });

  it("counts what is still owed to the cloud", async () => {
    const b = await store.backlog();
    expect(b.orders).toBeGreaterThan(0); // o-2 and o-3 were never synced
    expect(b.preps).toBeGreaterThan(0);
  });
});
