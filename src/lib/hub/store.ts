import type { DatabaseSync } from "node:sqlite";
import type { LocalOrderRecord } from "./local";
import type { PrepOrder } from "@/lib/cafe/prep-actions";

/**
 * The hub's own memory — one SQLite file on the mini PC in the shop.
 *
 * Deliberately node:sqlite and not a dependency: it ships with Node 24, which
 * package.json already requires. A restaurant till is the last place that
 * should need a native module rebuilt after an npm install at 11pm.
 *
 * NOTHING here is imported at module load on a managed host. The database is
 * opened lazily behind hubEnabled(), and node:sqlite itself is a dynamic
 * import — Netlify runs an older Node where that specifier does not resolve,
 * and a top-level import would take the whole site down to add an offline
 * feature the cloud never uses.
 */

/** Is this process the shop hub? Off everywhere else, including Netlify. */
export function hubEnabled(): boolean {
  return process.env.STATION_HUB === "1";
}

const SCHEMA = `
create table if not exists cache (
  key   text primary key,
  json  text not null,
  at    integer not null
);

create table if not exists counters (
  day       text primary key,
  last_seq  integer not null
);

create table if not exists local_orders (
  id          text primary key,
  day         text not null,
  seq         integer not null,
  created_at  text not null,
  lines_json  text not null,
  meta_json   text not null,
  display_json text not null,
  prep_status text not null default 'new',
  prep_at     text,
  synced_at   integer,
  cloud_seq   integer,
  tries       integer not null default 0,
  last_error  text
);
create index if not exists local_orders_pending on local_orders(synced_at) where synced_at is null;

-- Keyed by order, not append-only: only the LATEST status of an order matters,
-- and 0025 settled that prep_status is last-writer-wins. Replaying
-- new→preparing→ready in order would be three round trips to reach the same
-- state one row already describes.
create table if not exists prep_outbox (
  order_id  text primary key,
  status    text not null,
  at        text not null,
  sent_at   integer
);
`;

let opened: DatabaseSync | null = null;
let opening: Promise<DatabaseSync | null> | null = null;

async function open(): Promise<DatabaseSync | null> {
  if (!hubEnabled()) return null;
  if (opened) return opened;
  if (opening) return opening;

  opening = (async () => {
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const { mkdirSync } = await import("node:fs");
      const path = await import("node:path");

      const file = process.env.STATION_HUB_DB || path.join(process.cwd(), ".hub", "station.db");
      mkdirSync(path.dirname(file), { recursive: true });

      const db = new DatabaseSync(file);
      // WAL so a read from the KDS never blocks the till writing an order
      db.exec("pragma journal_mode = WAL");
      db.exec("pragma busy_timeout = 3000");
      db.exec(SCHEMA);
      opened = db;
      return db;
    } catch (e) {
      // A hub that cannot open its database must not take the app down with
      // it: the cloud path still works, and this is loud in the log.
      console.error("[hub] cannot open local database — running cloud-only:", e);
      return null;
    } finally {
      opening = null;
    }
  })();

  return opening;
}

// ── read-through cache ──────────────────────────────────────────────────────

export async function cachePut(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) return;
  db.prepare("insert into cache(key, json, at) values(?, ?, ?) on conflict(key) do update set json = excluded.json, at = excluded.at")
    .run(key, JSON.stringify(value), Date.now());
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  const row = db.prepare("select json from cache where key = ?").get(key) as { json?: string } | undefined;
  if (!row?.json) return null;
  try {
    return JSON.parse(row.json) as T;
  } catch {
    return null;
  }
}

// ── order numbers ───────────────────────────────────────────────────────────

/**
 * Claim the next shop number for `day`.
 *
 * `next` is passed in rather than computed here so the wrap rule lives in one
 * tested place (local.ts) and this file stays a dumb store.
 */
export async function allocSeq(day: string, next: (last: number | null) => number): Promise<number> {
  const db = await open();
  if (!db) return next(null);
  const row = db.prepare("select last_seq from counters where day = ?").get(day) as { last_seq?: number } | undefined;
  const seq = next(row?.last_seq ?? null);
  db.prepare("insert into counters(day, last_seq) values(?, ?) on conflict(day) do update set last_seq = excluded.last_seq")
    .run(day, seq);
  return seq;
}

/**
 * Remember a number the cloud handed out while we were online.
 *
 * Without this the hub would restart its own counter at 1 the moment the line
 * dropped and hand a second customer a number already on somebody's receipt.
 */
export async function noteCloudSeq(day: string, seq: number): Promise<void> {
  const db = await open();
  if (!db || seq > 899) return; // 900+ is the web band; not ours to track
  db.prepare("insert into counters(day, last_seq) values(?, ?) on conflict(day) do update set last_seq = max(counters.last_seq, excluded.last_seq)")
    .run(day, seq);
}

// ── orders taken offline ────────────────────────────────────────────────────

export async function saveLocalOrder(rec: LocalOrderRecord): Promise<void> {
  const db = await open();
  if (!db) throw new Error("hub store unavailable");
  db.prepare(
    `insert into local_orders(id, day, seq, created_at, lines_json, meta_json, display_json, prep_status)
     values(?, ?, ?, ?, ?, ?, ?, 'new')`,
  ).run(rec.id, rec.day, rec.seq, rec.createdAt, JSON.stringify(rec.lines), JSON.stringify(rec.meta), JSON.stringify(rec.display));
}

export type StoredLocalOrder = {
  id: string;
  day: string;
  seq: number;
  created_at: string;
  lines: LocalOrderRecord["lines"];
  meta: LocalOrderRecord["meta"];
  display: PrepOrder;
  prep_status: string;
  synced_at: number | null;
  tries: number;
};

type Row = {
  id: string; day: string; seq: number; created_at: string;
  lines_json: string; meta_json: string; display_json: string;
  prep_status: string; synced_at: number | null; tries: number;
};

function hydrate(r: Row): StoredLocalOrder {
  const display = JSON.parse(r.display_json) as PrepOrder;
  return {
    id: r.id,
    day: r.day,
    seq: r.seq,
    created_at: r.created_at,
    lines: JSON.parse(r.lines_json) as LocalOrderRecord["lines"],
    meta: JSON.parse(r.meta_json) as LocalOrderRecord["meta"],
    // the stored snapshot can be older than the status column, which moves
    // every time a chef taps the screen; the column wins
    display: { ...display, prep_status: r.prep_status as PrepOrder["prep_status"] },
    prep_status: r.prep_status,
    synced_at: r.synced_at,
    tries: r.tries,
  };
}

/** Orders still on the kitchen screens — local ones, whether synced or not. */
export async function liveLocalOrders(): Promise<StoredLocalOrder[]> {
  const db = await open();
  if (!db) return [];
  const rows = db
    .prepare("select * from local_orders where prep_status in ('new','preparing','ready') order by created_at asc limit 60")
    .all() as unknown as Row[];
  return rows.map(hydrate);
}

/** Orders the cloud has never seen. */
export async function unsyncedOrders(limit = 50): Promise<StoredLocalOrder[]> {
  const db = await open();
  if (!db) return [];
  const rows = db
    .prepare("select * from local_orders where synced_at is null order by created_at asc limit ?")
    .all(limit) as unknown as Row[];
  return rows.map(hydrate);
}

export async function markOrderSynced(id: string, cloudSeq: number): Promise<void> {
  const db = await open();
  if (!db) return;
  db.prepare("update local_orders set synced_at = ?, cloud_seq = ?, last_error = null where id = ?").run(Date.now(), cloudSeq, id);
}

export async function markOrderFailed(id: string, error: string): Promise<void> {
  const db = await open();
  if (!db) return;
  db.prepare("update local_orders set tries = tries + 1, last_error = ? where id = ?").run(error.slice(0, 300), id);
}

export async function isLocalOrder(id: string): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return !!db.prepare("select 1 from local_orders where id = ?").get(id);
}

// ── prep transitions ────────────────────────────────────────────────────────

export async function setLocalPrep(id: string, status: string, at: string): Promise<void> {
  const db = await open();
  if (!db) return;
  db.prepare("update local_orders set prep_status = ?, prep_at = ? where id = ?").run(status, at, id);
}

export async function queuePrep(orderId: string, status: string, at: string): Promise<void> {
  const db = await open();
  if (!db) return;
  db.prepare(
    `insert into prep_outbox(order_id, status, at, sent_at) values(?, ?, ?, null)
     on conflict(order_id) do update set status = excluded.status, at = excluded.at, sent_at = null`,
  ).run(orderId, status, at);
}

export async function pendingPreps(): Promise<{ order_id: string; status: string; at: string }[]> {
  const db = await open();
  if (!db) return [];
  return db.prepare("select order_id, status, at from prep_outbox where sent_at is null limit 100").all() as unknown as {
    order_id: string;
    status: string;
    at: string;
  }[];
}

export async function markPrepSent(orderId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  db.prepare("update prep_outbox set sent_at = ? where order_id = ?").run(Date.now(), orderId);
}

/** Counts for the hub status strip: what is still waiting to go up. */
export async function backlog(): Promise<{ orders: number; preps: number }> {
  const db = await open();
  if (!db) return { orders: 0, preps: 0 };
  const o = db.prepare("select count(*) as n from local_orders where synced_at is null").get() as { n: number };
  const p = db.prepare("select count(*) as n from prep_outbox where sent_at is null").get() as { n: number };
  return { orders: o?.n ?? 0, preps: p?.n ?? 0 };
}
