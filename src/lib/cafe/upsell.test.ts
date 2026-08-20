import { describe, it, expect } from "vitest";
import { pickUpsell, recommendedFor } from "./upsell";
import type { MenuCategoryView, MenuItemView } from "./menu-data";

const item = (id: string, name_ar: string, price: number): MenuItemView => ({
  id,
  name_ar,
  description: null,
  image_url: null,
  price,
  flavors: [],
  variants: [],
});

const MENU: MenuCategoryView[] = [
  { name_ar: "برجر", image_url: null, items: [item("b1", "برجر كلاسيك", 4750), item("b2", "ماشروم برجر", 6500)] },
  { name_ar: "بيتزا", image_url: null, items: [item("p1", "بيتزا سوبريم", 12000)] },
  { name_ar: "فرايس", image_url: null, items: [item("f1", "الويدجز", 2500), item("f2", "الكرلي", 3000)] },
  { name_ar: "صوصات", image_url: null, items: [item("s1", "رانش", 0), item("s2", "جبن", 500)] },
];

const none = new Set<string>();

describe("upsell rules", () => {
  it("offers a side to someone looking at a main", () => {
    const u = pickUpsell({ menu: MENU, focusItemId: "b1", inCart: none })!;
    expect(u.category).toBe("فرايس");
    expect(u.reason).toBe("side");
  });

  it("offers a main to someone looking at a side", () => {
    const u = pickUpsell({ menu: MENU, focusItemId: "f1", inCart: none })!;
    expect(["برجر", "بيتزا", "كنتاكي", "زنجر"]).toContain(u.category);
    expect(u.reason).toBe("main");
  });

  it("never offers the item being looked at", () => {
    for (const id of ["b1", "f1", "p1", "s2"]) {
      expect(pickUpsell({ menu: MENU, focusItemId: id, inCart: none })?.item.id).not.toBe(id);
    }
  });

  it("never offers something already in the basket", () => {
    // the whole fries category is already ordered
    const u = pickUpsell({ menu: MENU, focusItemId: "b1", inCart: new Set(["f1", "f2"]) });
    expect(u?.item.id).not.toBe("f1");
    expect(u?.item.id).not.toBe("f2");
    // sauces are the only side-ish thing left
    expect(u?.category).toBe("صوصات");
  });

  it("never offers a free item — a garnish is not an upsell", () => {
    const u = pickUpsell({ menu: MENU, focusItemId: "b1", inCart: new Set(["f1", "f2"]) })!;
    expect(u.item.price).toBeGreaterThan(0);
    expect(u.item.id).toBe("s2");
  });

  it("prefers the cheapest add-on, because a small yes is an easy yes", () => {
    const u = pickUpsell({ menu: MENU, focusItemId: "b1", inCart: none })!;
    expect(u.item.id).toBe("f1"); // 2,500 beats 3,000
  });

  it("carries the item being looked at, and prices the PAIR", () => {
    // «أضف الويدجز معه» has to add both — offering a side alone left customers
    // with a basket of chips and no burger
    const u = pickUpsell({ menu: MENU, focusItemId: "b1", inCart: none })!;
    expect(u.focus.id).toBe("b1");
    expect(u.total).toBe(4750 + 2500);
  });

  it("lets the margin engine override the cheap default", () => {
    const u = pickUpsell({ menu: MENU, focusItemId: "b1", inCart: none, prefer: ["f2"] })!;
    expect(u.item.id).toBe("f2");
  });

  it("stays silent when there is nothing sensible to add", () => {
    const soldOut: MenuCategoryView[] = [MENU[0]]; // burgers only, no sides at all
    expect(pickUpsell({ menu: soldOut, focusItemId: "b1", inCart: none })).toBeNull();
  });
});

describe("«مقترح لك»", () => {
  it("leads with exactly what the customer lingered on", () => {
    const r = recommendedFor({ menu: MENU, rankedItemIds: ["p1", "b2"], topCategories: [], inCart: none });
    expect(r.slice(0, 2).map((i) => i.id)).toEqual(["p1", "b2"]);
  });

  it("fills out from the categories they kept returning to", () => {
    const r = recommendedFor({ menu: MENU, rankedItemIds: [], topCategories: ["فرايس"], inCart: none, limit: 2 });
    expect(r.map((i) => i.id)).toEqual(["f1", "f2"]);
  });

  it("drops anything already in the basket", () => {
    // recommending what they already added makes the section look broken
    const r = recommendedFor({ menu: MENU, rankedItemIds: ["p1", "b2"], topCategories: [], inCart: new Set(["p1"]) });
    expect(r.map((i) => i.id)).not.toContain("p1");
    expect(r[0].id).toBe("b2");
  });

  it("never repeats an item that is both lingered on and in a hot category", () => {
    const r = recommendedFor({ menu: MENU, rankedItemIds: ["f1"], topCategories: ["فرايس"], inCart: none });
    expect(r.filter((i) => i.id === "f1")).toHaveLength(1);
  });

  it("respects the limit", () => {
    const r = recommendedFor({ menu: MENU, rankedItemIds: [], topCategories: ["برجر", "فرايس"], inCart: none, limit: 3 });
    expect(r).toHaveLength(3);
  });

  it("returns nothing when the basket already holds everything", () => {
    const all = new Set(MENU.flatMap((c) => c.items.map((i) => i.id)));
    expect(recommendedFor({ menu: MENU, rankedItemIds: ["b1"], topCategories: ["برجر"], inCart: all })).toEqual([]);
  });
});
