/**
 * A tiny in-memory cache for reference data — categories, stations, roles.
 *
 * These are a few dozen rows that change when the owner edits the menu, which
 * is to say almost never, and they were being re-fetched on every kitchen
 * refresh: two whole tables, every five seconds, on every open screen, from a
 * database ~320ms away. That is not a query cost, it is a standing tax.
 *
 * Deliberately not `unstable_cache`: this needs no revalidation plumbing, no
 * tags, and no cross-instance coherence. A stale category for sixty seconds is
 * a chef seeing a station name that changed a minute ago — which nobody will
 * ever notice, because renaming a station mid-service does not happen.
 *
 * ponytail: per-instance memory, no invalidation. A serverless cold start pays
 * one fetch. If a rename ever needs to appear instantly, call `clearRef()`
 * from wherever does the renaming.
 */

type Entry = { at: number; value: unknown };

const store = new Map<string, Entry>();

/** Load once, reuse for `ttlMs`. Failures are never cached. */
export async function cachedRef<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const value = await load();
  // An empty result is usually a failed fetch rather than an empty table, and
  // caching it would blank the kitchen for a minute.
  const empty = value == null || (Array.isArray(value) && value.length === 0);
  if (!empty) store.set(key, { at: Date.now(), value });
  return value;
}

/** Drop everything — call after an edit that must show up at once. */
export function clearRef(): void {
  store.clear();
}
