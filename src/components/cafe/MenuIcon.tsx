/**
 * Per-item food icons (أشكال الأصناف) — picked by item/category name.
 *
 * Rewritten for Station: the cafe build drew a coffee cup for everything, which
 * on a fast-food menu made every card look identical. These are line-art
 * shapes of the actual food, stroke-based and inheriting `currentColor` so they
 * tint with whatever they sit on.
 *
 * They also move. Each icon carries a small decoration group — heat wisps over
 * something hot, sizzle specks over something fried, a drip under a sauce — and
 * the whole glyph bobs gently. The bob is phase-shifted per item name so a grid
 * of cards ripples instead of pulsing in lockstep, which is the thing that
 * makes CSS animation look mechanical. All of it is disabled under
 * prefers-reduced-motion (see globals.css).
 */

type IconKind =
  | "pizza" | "pizzaLong"
  | "burger" | "burgerDouble" | "burgerChicken" | "zinger" | "sub"
  | "bucket" | "drumstick" | "wings" | "nuggets" | "strips" | "riceBowl"
  | "fries" | "curly" | "wedges" | "onionRings" | "garlicBread" | "loadedFries"
  | "sauce" | "soda";

/** hot things get heat wisps, fried things get sizzle, sauces drip */
const DECOR: Record<IconKind, "heat" | "sizzle" | "drip" | "none"> = {
  pizza: "heat", pizzaLong: "heat",
  burger: "heat", burgerDouble: "heat", burgerChicken: "heat", zinger: "heat", sub: "heat",
  bucket: "heat", drumstick: "heat", wings: "sizzle", nuggets: "sizzle", strips: "sizzle", riceBowl: "heat",
  fries: "sizzle", curly: "sizzle", wedges: "sizzle", onionRings: "sizzle", garlicBread: "heat", loadedFries: "sizzle",
  sauce: "drip", soda: "none",
};

export function iconKindFor(itemName: string, categoryName?: string): IconKind {
  const n = itemName;
  const c = categoryName ?? "";

  // category rail first — those names are exact and must never fall through
  if (n === "بيتزا") return "pizza";
  if (n === "برجر") return "burger";
  if (n === "كنتاكي") return "bucket";
  if (n === "زنجر") return "zinger";
  if (n === "فرايس") return "fries";
  if (n === "صوصات") return "sauce";

  // pizza
  if (n.includes("ليمو")) return "pizzaLong";
  if (n.includes("بيتزا") || c.includes("بيتزا")) return "pizza";

  // burgers — most specific first
  if (n.includes("دبل")) return "burgerDouble";
  if (n.includes("فيلي") || n.includes("ستيك")) return "sub";
  if (n.includes("برجر دجاج")) return "burgerChicken";
  if (n.includes("زنجر") || c.includes("زنجر")) return "zinger";
  if (n.includes("برجر") || c.includes("برجر")) return "burger";

  // chicken
  if (n.includes("أجنحة") || n.includes("اجنحة")) return "wings";
  if (n.includes("البوبلنز") || n.includes("بوبلنز")) return "nuggets";
  if (n.includes("ستربس")) return "strips";
  if (n.includes("ريزو")) return "riceBowl";
  if (n.includes("كنتاكي") || c.includes("كنتاكي")) return "bucket";

  // fries side
  if (n.includes("شيتو") || n.includes("جكن فرايز")) return "loadedFries";
  if (n.includes("بصل")) return "onionRings";
  if (n.includes("خبز")) return "garlicBread";
  if (n.includes("كرلي")) return "curly";
  if (n.includes("ويدجز")) return "wedges";
  if (n.includes("فنكر") || c.includes("فرايس")) return "fries";

  // sauces & drinks
  if (c.includes("صوص") || n.includes("صوص")) return "sauce";
  if (n.includes("بيبسي") || n.includes("مشروب") || n.includes("غازي")) return "soda";

  return "burger";
}

const PATHS: Record<IconKind, React.ReactNode> = {
  pizza: (
    <>
      <path d="M24 8 41 38a2 2 0 0 1-1.9 3H8.9A2 2 0 0 1 7 38z" />
      <path d="M12 33h24" />
      <circle cx="24" cy="20" r="2" />
      <circle cx="18" cy="29" r="2" />
      <circle cx="30" cy="29" r="2" />
    </>
  ),
  pizzaLong: (
    <>
      <rect x="5" y="16" width="38" height="16" rx="3" />
      <path d="M5 27h38" />
      <circle cx="13" cy="21" r="1.8" />
      <circle cx="24" cy="21" r="1.8" />
      <circle cx="35" cy="21" r="1.8" />
    </>
  ),
  burger: (
    <>
      <path d="M8 20c0-7 7-11 16-11s16 4 16 11z" />
      <path d="M8 25h32" />
      <path d="M9 31h30" />
      <path d="M8 34c0 4 4 6 8 6h16c4 0 8-2 8-6z" />
      <circle cx="18" cy="15" r="1" />
      <circle cx="26" cy="13" r="1" />
      <circle cx="32" cy="16" r="1" />
    </>
  ),
  burgerDouble: (
    <>
      <path d="M8 17c0-6 7-10 16-10s16 4 16 10z" />
      <path d="M8 22h32M9 27h30M8 32h32" />
      <path d="M8 36c0 3 4 5 8 5h16c4 0 8-2 8-5z" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="29" cy="11" r="1" />
    </>
  ),
  burgerChicken: (
    <>
      <path d="M8 20c0-7 7-11 16-11s16 4 16 11z" />
      <path d="M7 26c4-3 8 2 12-1s6 3 10 0 8 3 12-1" />
      <path d="M8 33c0 4 4 6 8 6h16c4 0 8-2 8-6z" />
      <circle cx="20" cy="14" r="1" />
      <circle cx="29" cy="14" r="1" />
    </>
  ),
  zinger: (
    <>
      <path d="M5 22c0-5 6-8 19-8s19 3 19 8z" />
      <path d="M4 27c5-3 9 2 14-1s9 3 14 0 8 2 12-1" />
      <path d="M5 32c0 4 5 6 19 6s19-2 19-6z" />
      <circle cx="17" cy="18" r="1" />
      <circle cx="30" cy="18" r="1" />
    </>
  ),
  sub: (
    <>
      <path d="M4 24c0-6 8-9 20-9s20 3 20 9z" />
      <path d="M6 29c4-2 7 1 11-1s7 2 11 0 7 2 12-1" />
      <path d="M4 30c0 5 8 8 20 8s20-3 20-8z" />
    </>
  ),
  bucket: (
    <>
      <path d="M11 17h26l-3 21a4 4 0 0 1-4 3.5H18a4 4 0 0 1-4-3.5z" />
      <path d="M9 17h30" />
      <path d="M18 24c3-3 9-3 12 0" />
      <path d="M20 32h8" />
    </>
  ),
  drumstick: (
    <>
      <path d="M30 9a9 9 0 0 1 6 15c-3 3-4 5-6 8l-5-5c3-2 5-3 8-6" />
      <path d="M25 27 12 40" />
      <path d="M14 33l5 5" />
    </>
  ),
  wings: (
    <>
      <path d="M22 10c8-2 15 3 16 11-6 2-11 0-14-4" />
      <path d="M20 22c8-1 13 4 13 11-6 2-11-1-13-5" />
      <path d="M22 10 8 40" />
    </>
  ),
  nuggets: (
    <>
      <path d="M9 16c4-4 10-3 12 1s-2 8-7 7-8-5-5-8z" />
      <path d="M27 12c4-3 10-1 11 3s-4 7-8 6-6-6-3-9z" />
      <path d="M13 31c4-4 11-2 12 2s-3 8-8 7-7-6-4-9z" />
      <path d="M30 28c4-3 9-1 10 3s-4 7-8 6-5-6-2-9z" />
    </>
  ),
  strips: (
    <>
      <rect x="7" y="12" width="9" height="27" rx="4" />
      <rect x="19" y="9" width="9" height="30" rx="4" />
      <rect x="31" y="14" width="9" height="25" rx="4" />
      <path d="M11 20v10M23 17v14M35 22v10" strokeDasharray="1.5 4" />
    </>
  ),
  riceBowl: (
    <>
      <path d="M7 22h34c0 10-8 17-17 17S7 32 7 22z" />
      <path d="M5 22h38" />
      <path d="M16 16c2-3 6-3 8 0M24 13c2-3 6-3 8 0" />
    </>
  ),
  fries: (
    <>
      <path d="M13 22h22l-2.5 17a3 3 0 0 1-3 2.5h-11a3 3 0 0 1-3-2.5z" />
      <path d="M11 22h26" />
      <path d="M17 21V9M23 21V6M29 21V10M35 21v-8" />
      <path d="M15 30h18" strokeDasharray="2 4" />
    </>
  ),
  curly: (
    <>
      <path d="M12 25h24l-2 15a3 3 0 0 1-3 2.5H17a3 3 0 0 1-3-2.5z" />
      <path d="M10 25h28" />
      <path d="M17 23c-3-3 1-6 4-4s0-6 4-6 3 5 6 4 4 4 1 6" />
    </>
  ),
  wedges: (
    <>
      <path d="M10 26h28l-3 14a3 3 0 0 1-3 2.5H16a3 3 0 0 1-3-2.5z" />
      <path d="M8 26h32" />
      <path d="m18 24 4-13 5 13M27 24l6-11 3 11" />
    </>
  ),
  onionRings: (
    <>
      <circle cx="17" cy="18" r="8" />
      <circle cx="17" cy="18" r="3.5" />
      <circle cx="31" cy="28" r="9" />
      <circle cx="31" cy="28" r="4" />
    </>
  ),
  garlicBread: (
    <>
      <path d="M6 30c0-8 8-14 18-14s18 6 18 14z" />
      <path d="M6 30c0 4 4 6 9 6h18c5 0 9-2 9-6" />
      <path d="M16 22c2 2 2 4 0 6M24 20c2 2 2 5 0 7M32 22c2 2 2 4 0 6" />
    </>
  ),
  loadedFries: (
    <>
      <path d="M11 24h26l-3 16a3 3 0 0 1-3 2.5H17a3 3 0 0 1-3-2.5z" />
      <path d="M9 24h30" />
      <path d="M8 21c4-4 8 1 12-2s8 3 12 0 6 2 8 1" />
      <path d="M16 22V12M24 22V9M32 22v-9" />
    </>
  ),
  sauce: (
    <>
      <path d="M13 18h22l-2 18a4 4 0 0 1-4 3.5H19a4 4 0 0 1-4-3.5z" />
      <path d="M11 18h26" />
      <path d="M18 26c3-3 9-3 12 0" />
    </>
  ),
  soda: (
    <>
      <path d="M15 14h18l-2 24a4 4 0 0 1-4 3.5h-6a4 4 0 0 1-4-3.5z" />
      <path d="M13 14h22" />
      <path d="M31 6 25 15" />
      <path d="M18 24h12" strokeDasharray="2 3" />
    </>
  ),
};

/** Small motion group drawn above/below the food, per decoration type. */
function Decoration({ kind }: { kind: "heat" | "sizzle" | "drip" | "none" }) {
  if (kind === "heat") {
    return (
      <g className="st-ico-heat" strokeWidth="2">
        <path d="M18 8c-2 2 2 3 0 5" style={{ animationDelay: "0ms" }} />
        <path d="M24 5c-2 2 2 3 0 5" style={{ animationDelay: "260ms" }} />
        <path d="M30 8c-2 2 2 3 0 5" style={{ animationDelay: "520ms" }} />
      </g>
    );
  }
  if (kind === "sizzle") {
    return (
      <g className="st-ico-sizzle" fill="currentColor" stroke="none">
        <circle cx="15" cy="8" r="1.4" style={{ animationDelay: "0ms" }} />
        <circle cx="24" cy="5" r="1.6" style={{ animationDelay: "300ms" }} />
        <circle cx="33" cy="9" r="1.3" style={{ animationDelay: "620ms" }} />
      </g>
    );
  }
  if (kind === "drip") {
    return (
      <g className="st-ico-drip" fill="currentColor" stroke="none">
        <circle cx="24" cy="41" r="1.8" />
      </g>
    );
  }
  return null;
}

/** Stable 0–1 hash so each item bobs on its own phase instead of in lockstep. */
function phase(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export function MenuIcon({
  name,
  category,
  className,
  animated = true,
}: {
  name: string;
  category?: string;
  className?: string;
  /** off for print, dense admin tables, and anywhere motion would be noise */
  animated?: boolean;
}) {
  const kind = iconKindFor(name, category);
  const decor = DECOR[kind];
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g
        className={animated ? "st-ico-bob" : undefined}
        style={animated ? { animationDelay: `${-phase(name) * 3.2}s` } : undefined}
      >
        {PATHS[kind]}
        {animated && <Decoration kind={decor} />}
      </g>
    </svg>
  );
}
