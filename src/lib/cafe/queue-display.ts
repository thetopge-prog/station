/**
 * The two decisions the ceiling display makes on every redraw, kept pure so
 * they can be tested without a database or a television.
 *
 * Both exist because that screen has no memory. It is redrawn by an HTTP
 * `Refresh` header every few seconds — the only mechanism a TV browser cannot
 * suspend — and each redraw is a fresh page that knows nothing about what was
 * on the wall a moment ago. Anything that has to change between redraws must
 * therefore be derived from the clock.
 */

/**
 * Did an order go ready since the previous redraw?
 *
 * «Is anything ready» is useless here: it is true on every redraw, so a bell
 * hung on it either never stops or never rings. «Went ready within the last
 * redraw» is true exactly once — the moment a customer should look up.
 *
 * The window is one interval plus two seconds of slack for the round trip to
 * the database. Ringing twice occasionally is a much smaller fault than
 * missing the one ring that mattered.
 */
export function justWentReady(
  rows: { prep_status: string; updated_at: string }[],
  seconds: number,
): boolean {
  const cutoff = Date.now() - (seconds + 2) * 1000;
  return rows.some((r) => r.prep_status === "ready" && new Date(r.updated_at).getTime() >= cutoff);
}

/**
 * Which advert slide it is, by the clock rather than by a timer.
 *
 * A television that cannot run a timer cannot advance a slideshow either — it
 * would show poster one for ever, which is how a menu board becomes wallpaper
 * nobody reads. Bucketing the clock by the redraw interval makes each redraw
 * land on the next poster.
 */
export function slideNow(count: number, seconds: number): number {
  if (count < 2) return 0;
  return Math.floor(Date.now() / (seconds * 1000)) % count;
}
