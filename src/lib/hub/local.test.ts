import { describe, it, expect } from "vitest";
import { buildLocalOrder, forStation, genPickupCode, nextSeq, HUB_SEQ_MAX, PICKUP_ALPHABET } from "./local";
import type { PriceBook, Routing } from "./local";
import type { SubmitOrderInput } from "@/lib/cafe/order-actions";

const ROUTING: Routing = {
  pizza1: { category_name: "بيتزا", station_id: "st-oven", station_name: "فرن البيتزا" },
  fries1: { category_name: "فرايس", station_id: "st-grill", station_name: "الشواية" },
  sauce1: { category_name: "صوصات", station_id: null, station_name: null },
};

const PRICES: PriceBook = {
  pizza1: { name_ar: "بيتزا سوبريم", flavors: [], variants: { v_large: { name_ar: "كبير" } } },
  fries1: { name_ar: "الويدجز", flavors: [], variants: {} },
  sauce1: { name_ar: "رانش", flavors: [], variants: {} },
};

const NAMES = { emp1: "أحمد", emp2: "سيف" };
const NOW = new Date("2026-08-20T18:30:00.000Z");

function build(input: SubmitOrderInput) {
  return buildLocalOrder({
    input,
    id: "ord-1",
    seq: 42,
    now: NOW,
    routing: ROUTING,
    prices: PRICES,
    staffNames: NAMES,
    cashierId: "emp1",
    expediterId: "emp2",
    pickupCode: "K7M",
  });
}

describe("shop numbering", () => {
  it("starts at 1 with no history", () => {
    expect(nextSeq(null)).toBe(1);
  });

  it("stays inside the shop band so it can never collide with a web order", () => {
    // 0025 split the line: shop 1..899, web 900+. Crossing it would break
    // unique(business_day, order_seq) on replay and lose the sale.
    expect(nextSeq(HUB_SEQ_MAX)).toBe(1);
    expect(nextSeq(898)).toBe(899);
    expect(nextSeq(950)).toBe(1);
  });
});

describe("pickup code", () => {
  it("is three characters from the spoken-safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const c = genPickupCode();
      expect(c).toHaveLength(3);
      for (const ch of c) expect(PICKUP_ALPHABET).toContain(ch);
    }
  });

  it("excludes every character that sounds like another one", () => {
    // the whole point of the alphabet: 0/O and 1/I/L cause the second phone call
    for (const bad of ["0", "O", "1", "I", "L"]) expect(PICKUP_ALPHABET).not.toContain(bad);
  });
});

describe("an order taken during an outage", () => {
  it("resolves names, variants and stations from the cached snapshot", () => {
    const rec = build({
      channel: "qr",
      table: "5",
      lines: [{ item_id: "pizza1", variant_id: "v_large", qty: 1 }, { item_id: "fries1", qty: 2 }],
    });

    expect(rec.display.items[0].name_ar).toBe("بيتزا سوبريم - كبير");
    expect(rec.display.items[0].station_name).toBe("فرن البيتزا");
    expect(rec.display.items[1].qty).toBe(2);
    expect(rec.display.order_seq).toBe(42);
    expect(rec.display.pickup_code).toBe("K7M");
  });

  it("carries both names, because every assembly ticket must name them", () => {
    const rec = build({ channel: "qr", table: "5", lines: [{ item_id: "fries1", qty: 1 }] });
    expect(rec.display.cashier_name).toBe("أحمد");
    expect(rec.display.expediter_name).toBe("سيف");
  });

  it("keeps the delivery address and phone that the old bug dropped", () => {
    const rec = build({
      channel: "delivery",
      lines: [{ item_id: "fries1", qty: 1 }],
      name: "علي",
      phone: "07700000000",
      address: "الرمادي — حي التأميم",
    });
    expect(rec.meta.address).toBe("الرمادي — حي التأميم");
    expect(rec.meta.phone).toBe("07700000000");
    expect(rec.display.customer_phone).toBe("07700000000");
  });

  it("replays the raw lines, never a price it computed itself", () => {
    const rec = build({ channel: "qr", lines: [{ item_id: "pizza1", variant_id: "v_large", qty: 3 }] });
    expect(rec.lines).toEqual([{ item_id: "pizza1", variant_id: "v_large", qty: 3 }]);
    expect(JSON.stringify(rec)).not.toMatch(/subtotal|unit_price|cost/);
  });

  it("survives an item missing from the cache rather than dropping the line", () => {
    const rec = build({ channel: "qr", lines: [{ item_id: "unknown", qty: 1 }] });
    expect(rec.display.items).toHaveLength(1);
    expect(rec.display.items[0].station_id).toBeNull();
  });

  it("files the order under the Baghdad business day, not UTC", () => {
    // 21:30 Baghdad on the 20th is still the 20th; a UTC read would say so too,
    // but 23:30 Baghdad is 20:30 UTC and the naive answer is a day early
    const late = buildLocalOrder({
      input: { channel: "qr", lines: [{ item_id: "fries1", qty: 1 }] },
      id: "x", seq: 1, now: new Date("2026-08-20T21:30:00.000Z"),
      routing: ROUTING, prices: PRICES, staffNames: NAMES,
      cashierId: null, expediterId: null, pickupCode: "AAA",
    });
    expect(late.day).toBe("2026-08-21");
  });
});

describe("station filtering", () => {
  const rec = build({
    channel: "qr",
    lines: [{ item_id: "pizza1", qty: 1 }, { item_id: "fries1", qty: 1 }, { item_id: "sauce1", qty: 1 }],
  });

  it("shows a chef only their own station's items", () => {
    const oven = forStation(rec.display, "st-oven")!;
    expect(oven.items).toHaveLength(1);
    expect(oven.items[0].name_ar).toBe("بيتزا سوبريم");
  });

  it("gives a station with nothing in the order no card at all", () => {
    // same invariant as the print router: an empty ticket is a chef walking
    // over to read nothing
    expect(forStation(rec.display, "st-burger")).toBeNull();
  });

  it("gives the expediter everything, sauces included", () => {
    expect(forStation(rec.display, null)!.items).toHaveLength(3);
  });
});
