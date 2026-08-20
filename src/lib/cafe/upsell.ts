import type { MenuCategoryView, MenuItemView } from "./menu-data";

/**
 * What to offer someone who is clearly interested in something else.
 *
 * Pure: menu in, suggestion out. No React, no clock, no randomness — so the
 * rules below are unit-testable, which matters because a bad suggestion is
 * worse than none. Offering fries to someone staring at fries reads as broken.
 */

/** categories that are a meal on their own */
const MAINS = ["بيتزا", "برجر", "كنتاكي", "زنجر"];
/** what goes alongside one */
const SIDES = ["فرايس"];
const SAUCES = ["صوصات"];

export type Upsell = {
  /** the item the customer was looking at — the reason the nudge exists */
  focus: MenuItemView;
  /** the add-on being offered alongside it */
  item: MenuItemView;
  category: string;
  reason: "side" | "sauce" | "main";
  /** what both together cost, so the toast can be honest about it */
  total: number;
};

const catOf = (menu: MenuCategoryView[], itemId: string) =>
  menu.find((c) => c.items.some((i) => i.id === itemId))?.name_ar ?? null;

/**
 * Pick an add-on for the item the customer is dwelling on.
 *
 * The rule is the oldest one in fast food: a main wants a side, a side wants a
 * main. It needs no cost data, so it works from day one — but when `prefer`
 * carries the margin ranking those items are chosen first, which is where the
 * money is.
 *
 * Returns null rather than forcing a suggestion when nothing sensible fits:
 * silence is a valid answer and the alternative is noise.
 */
export function pickUpsell({
  menu,
  focusItemId,
  inCart,
  prefer = [],
}: {
  menu: MenuCategoryView[];
  focusItemId: string;
  /** item ids already in the basket — never upsell what they have */
  inCart: Set<string>;
  /** ids in preference order, e.g. from the margin engine */
  prefer?: string[];
}): Upsell | null {
  const focus = menu.flatMap((c) => c.items).find((i) => i.id === focusItemId);
  const focusCat = catOf(menu, focusItemId);
  if (!focus || !focusCat) return null;

  // A main wants a side; a side or sauce wants a main. Ordered by TIER, not
  // flattened: for a burger, fries are the attach everyone expects and a sauce
  // is what you fall back to when the fryer categories are unavailable. A
  // flat cheapest-first pool picks the 500 IQD sauce over the 2,500 fries and
  // makes the suggestion look random.
  const tiers = MAINS.includes(focusCat)
    ? [SIDES, SAUCES]
    : SIDES.includes(focusCat) || SAUCES.includes(focusCat)
      ? [MAINS]
      : [];
  if (!tiers.length) return null;
  const tierOf = (cat: string) => tiers.findIndex((t) => t.includes(cat));
  const wanted = tiers.flat();

  const pool = menu
    .filter((c) => wanted.includes(c.name_ar))
    .flatMap((c) => c.items.map((i) => ({ item: i, category: c.name_ar })))
    // never suggest something already in the basket, the item itself, or a
    // zero-price line (a free sauce is not an upsell, it is a garnish)
    .filter((x) => x.item.id !== focusItemId && !inCart.has(x.item.id) && x.item.price > 0);
  if (!pool.length) return null;

  const rank = (id: string) => {
    const i = prefer.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  // margin ranking first, then tier, then the cheapest — a small add-on is an
  // easy yes and a big one makes the customer reconsider the whole basket
  pool.sort(
    (a, b) =>
      rank(a.item.id) - rank(b.item.id) ||
      tierOf(a.category) - tierOf(b.category) ||
      a.item.price - b.item.price,
  );

  const best = pool[0];
  return {
    focus,
    item: best.item,
    category: best.category,
    reason: SIDES.includes(best.category) ? "side" : SAUCES.includes(best.category) ? "sauce" : "main",
    // «معه» has to mean what it says: the offer is the pair, so the price shown
    // is the pair's price. Adding only the side — which is what this did before
    // — leaves the customer with a basket of chips and no burger.
    total: focus.price + best.item.price,
  };
}

/**
 * «مقترح لك» — the checkout list, ordered by what they actually looked at.
 *
 * Excludes anything already in the basket: a recommendation the customer has
 * already acted on makes the whole section look like it is not paying
 * attention, which is exactly the opposite of the intended impression.
 */
export function recommendedFor({
  menu,
  rankedItemIds,
  topCategories,
  inCart,
  limit = 4,
}: {
  menu: MenuCategoryView[];
  /** item ids by attention, strongest first */
  rankedItemIds: string[];
  /** category names by attention, strongest first */
  topCategories: string[];
  inCart: Set<string>;
  limit?: number;
}): MenuItemView[] {
  const byId = new Map(menu.flatMap((c) => c.items.map((i) => [i.id, i] as const)));
  const out: MenuItemView[] = [];
  const seen = new Set<string>();

  const push = (i?: MenuItemView) => {
    if (!i || seen.has(i.id) || inCart.has(i.id) || out.length >= limit) return;
    seen.add(i.id);
    out.push(i);
  };

  // 1. exactly what they lingered on
  for (const id of rankedItemIds) push(byId.get(id));

  // 2. then more from the categories they kept returning to — someone who
  //    circled the burgers three times without adding one is still deciding
  for (const cat of topCategories) {
    const c = menu.find((x) => x.name_ar === cat);
    for (const i of c?.items ?? []) push(i);
  }

  return out;
}
