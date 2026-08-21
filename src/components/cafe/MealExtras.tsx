"use client";

/**
 * What the extra money actually buys.
 *
 * A size picker that reads «ساندويچ 4,750 / وجبة 6,750» asks the customer to
 * pay two thousand dinars for a word. Showing the fries and the drink — the
 * shop's own studio shot, cut out so it floats — answers the question the
 * price alone raises, at the exact moment it is being asked.
 *
 * The free sauce is on the same panel for the same reason: it is already part
 * of the deal, and a deal nobody mentions persuades nobody.
 */

const MEAL_IMG = "/img/products/meal-sm.webp";
const SAUCE_IMG = "/img/products/sauce-cup-sm.webp";

/** a missing asset must never leave a broken-image icon on a customer's menu */
function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

export function MealExtras() {
  return (
    <div className="mb-4 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MEAL_IMG} alt="" aria-hidden onError={hideOnError} className="size-20 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--text)]">تشمل الوجبة 🎉</p>
          <p className="text-sm font-bold text-[var(--muted)]">بطاطا مقلية + مشروب غازي</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SAUCE_IMG} alt="" aria-hidden onError={hideOnError} className="size-11 shrink-0 rounded-full object-cover" />
        <p className="text-sm font-bold text-[var(--text)]">
          + علبة صوص <span className="font-black text-[var(--accent)]">مجاناً</span>
        </p>
      </div>
    </div>
  );
}
