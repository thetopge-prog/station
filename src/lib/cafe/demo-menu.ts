import type { MenuCategoryView, MenuItemView } from "./menu-data";

/**
 * Local menu for DEMO mode (no DB). Mirrors supabase/migrations/0030_station_menu.sql.
 * Ids are stable slugs; the demo order flow doesn't validate them server-side.
 *
 * This is not a throwaway fixture: menu-data.ts falls back to it whenever
 * Supabase env vars are missing, so it is what a customer sees on a fresh or
 * misconfigured deploy. It carried the old 36-drink coffee menu long after the
 * shop stopped selling coffee.
 */

const item = (
  id: string,
  name_ar: string,
  price: number,
  opts?: { flavors?: string[]; variants?: [string, number][] },
): MenuItemView => ({
  id,
  name_ar,
  description: null,
  image_url: null,
  price,
  flavors: opts?.flavors ?? [],
  // price 0 means "inherit the base price" — it mirrors price_override = null in
  // item_variants, which is how the real seed expresses the plain sandwich
  variants: (opts?.variants ?? []).map(([n, p]) => ({ id: `${id}-${n}`, name_ar: n, price: p || price })),
});

const cat = (name_ar: string, items: MenuItemView[]): MenuCategoryView => ({ name_ar, image_url: null, items });

/** dual price on the board = وجبة (with fries + a soft drink) vs the item alone */
const meal = (mealPrice: number, aloneLabel = "ساندويچ"): [string, number][] => [
  [aloneLabel, 0],
  ["وجبة", mealPrice],
];
const CRUST = ["كلاسيك", "عجينة سميكة", "محشية الأطراف"];

export const DEMO_MENU: MenuCategoryView[] = [
  cat("بيتزا", [
    item("pizza-bbq", "بيتزا دجاج الباربيكيو", 12000, { flavors: CRUST, variants: meal(17000, "منفرد") }),
    item("pizza-veggie", "بيتزا فري فيجي", 12000, { flavors: CRUST, variants: meal(17000, "منفرد") }),
    item("pizza-supreme", "بيتزا سوبريم", 12000, { flavors: CRUST, variants: meal(17000, "منفرد") }),
    item("pizza-pepperoni", "بيتزا بروني", 12000, { flavors: CRUST, variants: meal(17000, "منفرد") }),
    item("pizza-grilled", "بيتزا غريلد تشكن", 12000, { flavors: CRUST, variants: meal(17000, "منفرد") }),
    item("pizza-ranch", "بيتزا تشكن رانش", 12000, { flavors: CRUST, variants: meal(17000, "منفرد") }),
    item("pizza-limo", "بيتزا ليمو 1 متر", 36000, { flavors: CRUST }),
  ]),
  cat("برجر", [
    item("burger-classic", "برجر كلاسيك", 4750, { variants: meal(6750) }),
    item("burger-chicken", "برجر دجاج", 4250, { variants: meal(6250) }),
    item("burger-cheese", "برجر بالجبن", 5250, { variants: meal(7250) }),
    item("burger-smoky", "برجر سموكي", 5750, { variants: meal(7750) }),
    item("burger-mushroom", "ماشروم برجر", 6500, { variants: meal(8500) }),
    item("philly", "فيلي جبز ستيك", 6000, { variants: meal(8000) }),
    item("burger-jelly", "برجر جيلي", 6000, { variants: meal(8000) }),
    item("burger-double", "دبل برجر بالجبن", 8750, { variants: meal(10750) }),
  ]),
  cat("كنتاكي", [
    item("kfc-15", "كنتاكي 15 قطعة", 34000),
    item("kfc-8", "كنتاكي 8 قطع", 19000),
    item("kfc-5", "كنتاكي 5 قطع", 12500),
    item("kfc-3", "كنتاكي 3 قطع", 7750),
    item("strips-3", "ستربس 3 قطع", 6000),
    item("wings", "أجنحة", 6000, { flavors: ["سويت جيلي", "باربيكيو", "عسل الخردل", "بوفالو"] }),
    item("poppers", "البوبلنز", 3500, { flavors: ["سويت جيلي", "باربيكيو", "عسل الخردل", "بوفالو"] }),
    item("rizo", "ريزو", 5000),
  ]),
  cat("زنجر", [
    item("zinger-classic", "كلاسيك زنجر", 4500, { variants: meal(6500) }),
    item("zinger-smoke", "سموك زنجر", 5000, { variants: meal(7000) }),
    item("zinger-buffalo", "زنجر بوفالو", 5000, { variants: meal(7000) }),
    item("zinger-mighty", "مايتي زنجر", 7000, { variants: meal(9000) }),
  ]),
  cat("فرايس", [
    item("wedges", "الويدجز", 2500),
    item("curly", "الكرلي", 3000),
    item("onion-rings", "بصل مقرمش", 3000),
    item("garlic-bread", "خبز ثوم مع الجبن", 3500),
    item("finger-sauce", "فنكر صوص", 4000),
    item("finger-cheese", "فنكر بالجبن", 4000),
    item("chicken-fries", "جكن فرايز", 5000),
    item("cheeto-fries", "شيتو جكن فرايز", 6000),
  ]),
  cat("صوصات", [
    item("sauce-buffalo", "بوفالو", 0),
    item("sauce-bbq", "باربيكيو", 0),
    item("sauce-garlic", "ثوم", 0),
    item("sauce-honey", "عسل الخردل", 0),
    item("sauce-ranch", "رانش", 0),
    item("sauce-cheese", "جبن", 0),
    item("sauce-chili", "سويت جيلي", 0),
  ]),
];
