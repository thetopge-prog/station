/**
 * Next's one hook that runs once per server process, before any request.
 *
 * The hub's background push lives here rather than being kicked off by the
 * first request that happens to arrive: on a quiet morning after an overnight
 * outage, that first request could be an hour away, and the whole point is
 * that the backlog goes up the moment the line returns.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { hubEnabled } = await import("./lib/hub/store");
  if (!hubEnabled()) return;
  const { startHubWorker } = await import("./lib/hub/sync");
  startHubWorker();
}
