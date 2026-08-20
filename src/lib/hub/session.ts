import { createHash } from "node:crypto";
import { cacheGet, cachePut, hubEnabled } from "./store";
import type { Staff } from "@/lib/cafe/auth";

/**
 * Who is signed in, when the shop cannot ask Supabase.
 *
 * Validating a session normally means a round trip to Supabase Auth. During an
 * outage that call fails, getStaff() returns null, and every staff screen
 * bounces to a sign-in page that also cannot work. The result is a restaurant
 * that stops taking money because a router died.
 *
 * ── The rule, stated plainly ──────────────────────────────────────────────
 * The hub only accepts a token it has PERSONALLY watched Supabase accept, and
 * only for a limited window after that. It is not verifying a signature and it
 * is not trusting the browser: it is remembering an answer it was given.
 *
 * The trade-off is explicit — a session revoked in the cloud stays usable in
 * the shop until the grace window ends. That is unavoidable while offline (a
 * revocation cannot travel down a line that is down), it is bounded, and the
 * alternative is a till that stops working. Tokens are stored as SHA-256
 * hashes so the database on the mini PC never holds a usable credential.
 */

/** How long a remembered session stays good with no line. One long shift. */
const GRACE_MS = 16 * 60 * 60 * 1000;

const keyFor = (accessToken: string) => `sess:${createHash("sha256").update(accessToken).digest("hex")}`;

type Remembered = { staff: Staff; at: number };

/** Called after Supabase itself confirmed this token. */
export async function rememberSession(accessToken: string | null, staff: Staff): Promise<void> {
  if (!hubEnabled() || !accessToken) return;
  await cachePut(keyFor(accessToken), { staff, at: Date.now() } satisfies Remembered);
}

/**
 * The offline answer. Null unless this exact token was confirmed recently.
 *
 * Callers MUST establish that the cloud is unreachable first — this is a
 * fallback for an outage, never a shortcut around auth when the line is fine.
 */
export async function recallSession(accessToken: string | null): Promise<Staff | null> {
  if (!hubEnabled() || !accessToken) return null;
  const hit = await cacheGet<Remembered>(keyFor(accessToken));
  if (!hit?.staff) return null;
  if (Date.now() - hit.at > GRACE_MS) return null;
  return hit.staff;
}
