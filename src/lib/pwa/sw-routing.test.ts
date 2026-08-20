import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the service worker will and will not intercept.
 *
 * Runs the REAL public/sw.js — the file that ships — inside a stub worker
 * scope, because the hazard here is not a typo, it is scope creep: the day
 * someone widens a path prefix and the POS starts serving yesterday's HTML
 * from cache on a tablet nobody thinks to reload.
 *
 * A worker cannot import from src (no bundler runs over public/), so the file
 * is evaluated rather than imported. That is also what makes this test honest:
 * it cannot drift from the deployed worker.
 */

const ORIGIN = "http://hub.local:3000";

type Handlers = Record<string, (e: unknown) => void>;

function loadWorker(): Handlers {
  const code = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  const handlers: Handlers = {};

  const cacheStub = { match: async () => undefined, put: async () => {} };
  const scope = {
    addEventListener: (kind: string, fn: (e: unknown) => void) => {
      handlers[kind] = fn;
    },
    location: { origin: ORIGIN },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: { showNotification: async () => {} },
    skipWaiting: () => {},
  };
  const caches = {
    keys: async () => [],
    delete: async () => true,
    match: async () => undefined,
    open: async () => cacheStub,
  };

  new Function("self", "caches", "fetch", code)(scope, caches, async () => ({ ok: true, clone: () => ({}) }));
  return handlers;
}

/** true = the worker took over this request; false = it went to the network */
function intercepts(url: string, method = "GET"): boolean {
  const handlers = loadWorker();
  let taken = false;
  handlers.fetch({
    request: { method, url },
    respondWith: () => {
      taken = true;
    },
  });
  return taken;
}

describe("the service worker keeps its hands off anything live", () => {
  it("never intercepts a page", () => {
    // a cached page is a tablet running last week's POS
    for (const p of ["/", "/menu", "/cashier", "/kds", "/queue", "/partners", "/menu?mode=delivery"]) {
      expect(intercepts(ORIGIN + p), p).toBe(false);
    }
  });

  it("never intercepts a write", () => {
    // server actions are POSTs to the page URL — caching one would be a
    // replayed order, which is the worst bug this system could have
    expect(intercepts(ORIGIN + "/cashier", "POST")).toBe(false);
    expect(intercepts(ORIGIN + "/menu", "POST")).toBe(false);
  });

  it("never intercepts another origin", () => {
    // Supabase auth and storage must never be answered from our cache
    expect(intercepts("https://ahrxdwvxbykdktyclzdi.supabase.co/auth/v1/token")).toBe(false);
  });

  it("never intercepts a data route", () => {
    expect(intercepts(ORIGIN + "/api/orders/whatsapp")).toBe(false);
  });
});

describe("…and does cache the things that cannot go stale", () => {
  it("serves build assets, which carry their version in the filename", () => {
    expect(intercepts(ORIGIN + "/_next/static/chunks/main-a1b2c3.js")).toBe(true);
    expect(intercepts(ORIGIN + "/_next/static/css/app-9f8e.css")).toBe(true);
  });

  it("serves brand assets", () => {
    expect(intercepts(ORIGIN + "/icons/icon-192.png")).toBe(true);
    expect(intercepts(ORIGIN + "/logo.png")).toBe(true);
  });

  it("serves product photos — the heaviest thing on a menu over shop wifi", () => {
    expect(intercepts(ORIGIN + "/img/pizza-supreme.webp")).toBe(true);
  });

  it("still leaves an unhashed image outside those folders alone", () => {
    expect(intercepts(ORIGIN + "/some-random.png")).toBe(false);
  });
});

describe("worker lifecycle", () => {
  it("registers the handlers that make the app installable at all", () => {
    // Chrome refuses «إضافة إلى الشاشة الرئيسية» for a worker with no fetch
    // handler — which is why there was no install prompt before this existed
    const h = loadWorker();
    for (const k of ["install", "activate", "fetch", "push", "notificationclick"]) {
      expect(typeof h[k], k).toBe("function");
    }
  });
});
