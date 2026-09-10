import { describe, expect, it } from "vitest";
import { cartLine, restoreCart } from "./cart-storage";
import type { MenuCategoryView, MenuItemView } from "./menu-data";

const item = (id: string, price: number, extra: Partial<MenuItemView> = {}): MenuItemView => ({
  id,
  name_ar: `صنف ${id}`,
  description: null,
  image_url: null,
  price,
  flavors: [],
  variants: [],
  ...extra,
});

const menu: MenuCategoryView[] = [
  {
    name_ar: "برجر",
    image_url: null,
    items: [
      item("b1", 4750, { variants: [{ id: "v-meal", name_ar: "وجبة", price: 6750 }] }),
      item("w1", 6000, { flavors: ["بوفالو", "باربيكيو"] }),
    ],
  },
];
const at = 1_000_000;
const save = (lines: unknown[], when = at) => JSON.stringify({ at: when, lines });

describe("restoreCart — السلة المحفوظة لا تُصدَّق، تُعاد من المنيو الحالي", () => {
  it("لا شيء من الفراغ أو من نصّ تالف أو من سلة قديمة", () => {
    expect(restoreCart(null, menu, {}, at)).toEqual([]);
    expect(restoreCart("{not json", menu, {}, at)).toEqual([]);
    expect(restoreCart(save([{ itemId: "b1", qty: 1 }], at - 13 * 3_600_000), menu, {}, at)).toEqual([]);
  });

  it("يُسقط صنفاً حُذف وحجماً لم يعد موجوداً", () => {
    const raw = save([
      { itemId: "gone", qty: 1 },
      { itemId: "b1", variantId: "v-old", qty: 1 },
      { itemId: "b1", qty: 2 },
    ]);
    const out = restoreCart(raw, menu, {}, at);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: "b1", variantId: null, qty: 2 });
  });

  it("السعر من المنيو لا من المخزون، والعرض يُطبَّق", () => {
    const raw = save([{ itemId: "b1", qty: 1, unitPrice: 9999 }]);
    expect(restoreCart(raw, menu, {}, at)[0].unitPrice).toBe(4750);
    expect(restoreCart(raw, menu, { b1: 4000 }, at)[0].unitPrice).toBe(4000);
  });

  it("الحجم الأغلى يحتفظ بسعره حتى مع عرض على الأساسي", () => {
    const raw = save([{ itemId: "b1", variantId: "v-meal", qty: 1 }]);
    expect(restoreCart(raw, menu, { b1: 4000 }, at)[0].unitPrice).toBe(6750);
  });

  it("نكهة غير معروفة تسقط إلى لا نكهة، والكمية تُقصّ إلى عشرين", () => {
    const raw = save([
      { itemId: "w1", flavor: "كاري", qty: 99 },
      { itemId: "w1", flavor: "بوفالو", qty: 0 },
    ]);
    const out = restoreCart(raw, menu, {}, at);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ flavor: null, qty: 20 });
  });

  it("المفتاح يحمل الحجم والنكهة فلا يندمج برجران مختلفان", () => {
    const b1 = menu[0].items[0];
    expect(cartLine(b1, null, null, {}).key).toBe("b1||");
    expect(cartLine(b1, b1.variants[0], null, {}).key).toBe("b1|v-meal|");
    expect(cartLine(menu[0].items[1], null, "بوفالو", {}).key).toBe("w1||بوفالو");
  });
});
