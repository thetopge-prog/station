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

/**
 * How big a card may be, and how many fit, for a column holding `count` of them.
 *
 * The board had no sizing system at all: fixed 60px and 72px numbers, no cap on
 * how many orders arrive, and an `overflow-y-auto` that could never engage
 * because nothing in the chain above it had a definite height. A busy evening
 * therefore did not crowd the screen — it pushed the bottom of the board off
 * the bottom of the television, silently. The customer whose number was down
 * there was never told their food was ready.
 *
 * So cards shrink as the queue grows, and stop shrinking at a size that is
 * still readable from the far wall. Past that, the column pages instead.
 *
 * The geometry these numbers come from: the shop's set reports a CSS viewport
 * near 960×540 (televisions scale their own pixels), which leaves each column
 * roughly 390px of height under the header. Card height ≈ number + code + pad.
 *
 * That is arithmetic on paper, not a measurement of the room. It is one table
 * in one place precisely so the first crowded evening can correct it.
 */
export type QueueTier = { font: number; code: number; meta: number; cols: number; cardH: number };

/**
 * The sizes a card may take, largest first. `cardH` is imposed on the card
 * rather than measured off it, so the arithmetic below is exact instead of
 * approximate — a card that decides its own height makes the row count a guess.
 */
export const TIERS: QueueTier[] = [
  { font: 96, code: 30, meta: 18, cols: 1, cardH: 176 },
  { font: 80, code: 26, meta: 17, cols: 2, cardH: 152 },
  { font: 64, code: 22, meta: 16, cols: 2, cardH: 128 },
  { font: 52, code: 20, meta: 15, cols: 3, cardH: 112 },
  // الأرضية: ٤٤px ≈ ٥٫٥سم على شاشة ٥٥ بوصة ⇒ تُقرأ من ١١ متراً
  { font: 44, code: 18, meta: 14, cols: 3, cardH: 98 },
];

/**
 * The biggest cards that will fit `count` orders in `availH` pixels — and, if
 * even the smallest will not, how many fit on one page.
 *
 * The height is passed in, measured from the real box, because guessing it is
 * what broke this screen twice over. The first version of this function used
 * arithmetic on paper — «540px tall, minus a header, call it 390» — and the
 * browser then reported 220. Cards shrank on schedule and were clipped anyway.
 * A television, a tablet and a laptop all have different answers here, and the
 * only one worth trusting is the one the layout gives back.
 */
export function fitColumn(
  count: number,
  availH: number,
  { gap = 12, extraCols = 0 }: { gap?: number; extraCols?: number } = {},
): { tier: QueueTier; perPage: number } {
  // A tier is only a candidate if one of its cards actually fits the box.
  // Without this test a single order in a short column was handed the largest
  // card there is — one row of it "fits" by arithmetic, and is then clipped.
  const usable = TIERS.filter((t) => t.cardH <= availH);
  const pool = usable.length > 0 ? usable : [TIERS[TIERS.length - 1]];

  let tier = pool[pool.length - 1];
  let perPage = 1;
  for (const t of pool) {
    const rows = Math.max(1, Math.floor((availH + gap) / (t.cardH + gap)));
    // «جاهز» buys capacity with an extra column before it will page: a ready
    // number is an instruction to walk to the counter, and an instruction that
    // is only on screen half the time is a bad instruction.
    const cols = t.cols + (t.cols >= 3 ? extraCols : 0);
    tier = { ...t, cols };
    perPage = Math.max(1, rows * cols);
    if (perPage >= count) break;
  }
  return { tier, perPage };
}

/**
 * Which page of a column it is, by the clock — never by a timer.
 *
 * Same reason as slideNow: this screen is thrown away and rebuilt every few
 * seconds, so no memory survives between redraws, and a TV browser suspends
 * JS timers on a page nobody touches. Bucketing the clock makes each redraw
 * land on the next page on its own.
 */
export function pageNow(count: number, perPage: number, seconds: number, nowMs = Date.now()): number {
  const size = Math.max(1, perPage);
  const pages = Math.ceil(Math.max(0, count) / size);
  if (pages < 2) return 0;
  return Math.floor(nowMs / (seconds * 1000)) % pages;
}

/** The slice on show right now, and what to print under it. */
export function pageOf<T>(items: T[], perPage: number, seconds: number, nowMs = Date.now()) {
  const size = Math.max(1, perPage);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = pageNow(items.length, size, seconds, nowMs);
  return { shown: items.slice(page * size, page * size + size), page, pages };
}
