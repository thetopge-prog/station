import { connect } from "node:net";
import { getPublicSupabaseConfig } from "@/lib/supabase/constants";

/**
 * Is the cloud actually reachable right now?
 *
 * A raw TCP connect, not a fetch. Two reasons, both learned the hard way:
 *
 *  1. Next patches global fetch with its own caching and retry behaviour. A
 *     probe that is supposed to fail in 30ms instead retried its way to seven
 *     seconds — on the customer's menu, during the outage it exists to detect.
 *  2. A socket answers the actual question. DNS that resolves nowhere, a router
 *     with no upstream, and a paused project are all the same event to the
 *     shop, and all of them show up here as "cannot open a connection".
 *
 * The answer is cached briefly because a busy screen asks on every request.
 */

/** how long a "yes" is trusted — short, so a blip is noticed */
const UP_TTL_MS = 5_000;
/** how long a "no" is trusted — also short, so the line coming back is noticed */
const DOWN_TTL_MS = 3_000;
/** a shop LAN is milliseconds away from its own router; this is generous */
const PROBE_TIMEOUT_MS = 1_500;

let last: { at: number; ok: boolean } | null = null;
let inFlight: Promise<boolean> | null = null;

function tcpReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    // A hard deadline, not socket.setTimeout: that one measures idle time AFTER
    // a connection exists and does nothing while the connect itself hangs.
    // Measured here, a connect to a dead port sat for 6.8 seconds — on the
    // customer's menu, during the very outage this is meant to detect.
    const deadline = setTimeout(() => done(false), PROBE_TIMEOUT_MS);

    function done(ok: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(ok);
    }

    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function cloudReachable(): Promise<boolean> {
  const ttl = last?.ok ? UP_TTL_MS : DOWN_TTL_MS;
  if (last && Date.now() - last.at < ttl) return last.ok;
  // one probe serves every caller that arrives while it is running: a page
  // rendering six server components must not open six sockets
  if (inFlight) return inFlight;

  // Through getPublicSupabaseConfig, NOT process.env.NEXT_PUBLIC_SUPABASE_URL:
  // Next inlines NEXT_PUBLIC_* at BUILD time, so a direct read here probes
  // whatever URL was configured when the bundle was built. That reads as
  // "online" on a hub whose Supabase URL was changed afterwards — the probe
  // would be answering a question about a different server.
  const raw = getPublicSupabaseConfig()?.url;
  if (!raw) {
    last = { at: Date.now(), ok: false };
    return false;
  }

  inFlight = (async () => {
    let ok = false;
    try {
      const url = new URL(raw);
      ok = await tcpReachable(url.hostname, Number(url.port) || (url.protocol === "http:" ? 80 : 443));
    } catch {
      ok = false;
    }
    last = { at: Date.now(), ok };
    inFlight = null;
    return ok;
  })();

  return inFlight;
}

/**
 * Force the next check to say "down".
 *
 * Called when a Supabase call fails in a network-shaped way. supabase-js does
 * not throw on a dead socket — it returns the fetch error inside `error` — so
 * without this the cache would keep insisting we are online while every write
 * silently failed.
 */
export function markCloudDown(): void {
  last = { at: Date.now(), ok: false };
}

/** Does this Supabase error mean "no line" rather than "no permission"? */
export function isNetworkError(err: { message?: string } | null | undefined): boolean {
  const m = err?.message;
  if (!m) return false;
  return /fetch failed|network|timeout|abort|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|socket|getaddrinfo/i.test(m);
}
