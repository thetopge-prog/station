/**
 * The fold behind «الأصناف التي نفدت», kept pure so it can be tested without a
 * database — the table it feeds is a purchasing decision, and a wrong total
 * here is money spent on the wrong thing.
 */

/** one line of «ماذا نفد» — a name, how often, and what it cost in lost sales */
export type ShortageRow = { name: string; times: number; qty: number; lost: number; lastAt: string };

export type ShortageInput = { name_ar: string; qty: number; unit_price: number; unavailable_at: string | null };

/**
 * Counted by NAME rather than by item id: a renamed or deleted menu item is
 * still the same thing that ran out last month, and the owner buying stock
 * thinks in names.
 *
 * `rows` must arrive newest-first — `lastAt` is taken from the first sighting
 * of each name rather than by comparing dates, which is only correct under that
 * ordering. The caller orders by `unavailable_at desc`.
 *
 * Sorted worst-first, with lost money as the tie-break: two items that both ran
 * out twice are not equally urgent if one of them is the expensive one.
 */
export function foldShortages(rows: ShortageInput[]): ShortageRow[] {
  const by = new Map<string, ShortageRow>();
  for (const r of rows) {
    if (!r.unavailable_at) continue;
    const row = by.get(r.name_ar) ?? { name: r.name_ar, times: 0, qty: 0, lost: 0, lastAt: r.unavailable_at };
    row.times += 1;
    row.qty += r.qty;
    row.lost += r.unit_price * r.qty;
    by.set(r.name_ar, row);
  }
  return [...by.values()].sort((a, b) => b.times - a.times || b.lost - a.lost);
}
