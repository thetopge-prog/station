import { describe, it, expect } from "vitest";
import {
  routeOrder,
  stationsForOrder,
  unroutedItems,
  type PrintItem,
  type PrintOrder,
  type PrinterRow,
  type StationRow,
} from "./print-routing";

// ── fixture: the shop as configured by 0021/0022/0030 ──────────────────────
const STATIONS: StationRow[] = [
  { id: "st-pizza", name_ar: "فرن البيتزا" },
  { id: "st-burger", name_ar: "محطة البرجر" },
  { id: "st-grill", name_ar: "الشواية" },
  { id: "st-fryer", name_ar: "المقلاة" },
];

const PRINTERS: PrinterRow[] = [
  { id: "p1", name_ar: "طابعة الكاشير", kind: "receipt", station_id: null, is_active: true, copies: 1 },
  { id: "p2", name_ar: "فرن البيتزا", kind: "station", station_id: "st-pizza", is_active: true, copies: 1 },
  { id: "p3", name_ar: "محطة البرجر", kind: "station", station_id: "st-burger", is_active: true, copies: 1 },
  { id: "p4", name_ar: "الشواية", kind: "station", station_id: "st-grill", is_active: true, copies: 1 },
  { id: "p5", name_ar: "محطة التجهيز", kind: "expediter", station_id: null, is_active: true, copies: 1 },
];

// كنتاكي and زنجر share the grill — that is the spec, expressed as data
const CAT_STATION: Record<string, string | null> = {
  "cat-pizza": "st-pizza",
  "cat-burger": "st-burger",
  "cat-kfc": "st-grill",
  "cat-zinger": "st-grill",
  "cat-fries": "st-fryer",
  "cat-sauce": null,
};

function item(name: string, category_id: string | null, qty = 1, unit_price = 5000): PrintItem {
  return { name_ar: name, flavor_ar: null, qty, unit_price, category_id };
}

const ORDER: PrintOrder = {
  orderId: "3f2b1c88-9a4d-4e11-b7c2-0d5e6f7a8b90",
  orderNumber: "042",
  pickupCode: "7391",
  channel: "cashier",
  tableNo: null,
  note: "بدون مخلل",
  subtotal: 20000,
  discount: 0,
  extras: [],
  total: 20000,
  dateTime: "20/08/2026 19:31",
  cashierName: "أحمد",
};

function route(items: PrintItem[], printers = PRINTERS) {
  return routeOrder({ order: ORDER, items, printers, stations: STATIONS, categoryStation: CAT_STATION });
}

describe("print routing", () => {
  it("splits one order across receipt, every busy station, and the expediter", () => {
    const tickets = route([
      item("بيتزا سوبريم", "cat-pizza"),
      item("برجر كلاسيك", "cat-burger"),
      item("كلاسيك زنجر", "cat-zinger"),
      item("كنتاكي 5 قطع", "cat-kfc"),
    ]);

    expect(tickets.map((t) => t.printerId)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(tickets.filter((t) => t.kind === "station")).toHaveLength(3);
  });

  it("gives no ticket to a station with nothing to cook", () => {
    // burger-only order: the pizza oven and grill printers must stay silent
    const tickets = route([item("برجر دجاج", "cat-burger")]);
    expect(tickets.map((t) => t.printerId)).toEqual(["p1", "p3", "p5"]);
    expect(tickets.some((t) => t.stationId === "st-pizza")).toBe(false);
  });

  it("merges كنتاكي and زنجر onto the single grill ticket", () => {
    const tickets = route([
      item("كنتاكي 8 قطع", "cat-kfc"),
      item("مايتي زنجر", "cat-zinger"),
    ]);
    const grill = tickets.find((t) => t.stationId === "st-grill");
    expect(grill?.lines.map((l) => l.name)).toEqual(["كنتاكي 8 قطع", "مايتي زنجر"]);
    expect(tickets.filter((t) => t.kind === "station")).toHaveLength(1);
  });

  it("keeps money off every kitchen ticket", () => {
    const tickets = route([item("بيتزا بروني", "cat-pizza"), item("رانش", "cat-sauce")]);
    for (const t of tickets) {
      if (t.kind === "receipt") {
        expect(t.money?.total).toBe(20000);
        expect(t.lines.every((l) => l.amount !== null)).toBe(true);
      } else {
        expect(t.money).toBeNull();
        expect(t.lines.every((l) => l.amount === null)).toBe(true);
      }
    }
  });

  it("puts a station-less item on the receipt and assembly ticket only", () => {
    const tickets = route([item("بيتزا سوبريم", "cat-pizza"), item("سويت جيلي", "cat-sauce", 2, 0)]);
    const pizza = tickets.find((t) => t.stationId === "st-pizza")!;
    const exp = tickets.find((t) => t.kind === "expediter")!;
    const receipt = tickets.find((t) => t.kind === "receipt")!;

    expect(pizza.lines).toHaveLength(1); // sauce is not cooked
    expect(exp.lines).toHaveLength(2); // but it IS in the bag
    expect(receipt.lines).toHaveLength(2);
  });

  it("carries the pickup code and note onto every ticket", () => {
    const tickets = route([item("برجر جيلي", "cat-burger")]);
    expect(tickets.every((t) => t.order.pickupCode === "7391")).toBe(true);
    expect(tickets.every((t) => t.order.note === "بدون مخلل")).toBe(true);
  });

  it("skips printers that are switched off", () => {
    const half = PRINTERS.map((p) => (p.id === "p2" ? { ...p, is_active: false } : p));
    const tickets = route([item("بيتزا سوبريم", "cat-pizza")], half);
    // the order still sells and still prints — it just loses the oven slip
    expect(tickets.map((t) => t.kind)).toEqual(["receipt", "expediter"]);
  });

  it("produces nothing for an empty order", () => {
    expect(route([])).toEqual([]);
  });

  it("gives the receipt a tracking QR and the assembly ticket a SCANNABLE order id", () => {
    const tickets = routeOrder({
      order: ORDER,
      items: [item("بيتزا سوبريم", "cat-pizza")],
      printers: PRINTERS,
      stations: STATIONS,
      categoryStation: CAT_STATION,
      trackUrl: "https://station.iq/t",
    });

    const receipt = tickets.find((t) => t.kind === "receipt")!;
    const exp = tickets.find((t) => t.kind === "expediter")!;

    expect(receipt.qr).toBe("https://station.iq/t/042-7391");
    // the zero-touch trigger: scanning this is what flips the order to «جاهز»
    expect(exp.qr).toBe(ORDER.orderId);
    // a kitchen slip has nothing to scan — the cook never changes order status
    expect(tickets.filter((t) => t.kind === "station").every((t) => t.qr === null)).toBe(true);
  });

  it("keeps the assembly QR scannable even with no trackUrl configured", () => {
    // the receipt QR is optional (it needs a public URL); the expediter QR is
    // not, because the whole scan workflow depends on it
    const tickets = route([item("برجر كلاسيك", "cat-burger")]);
    expect(tickets.find((t) => t.kind === "expediter")!.qr).toBe(ORDER.orderId);
    expect(tickets.find((t) => t.kind === "receipt")!.qr).toBeNull();
  });

});

describe("routing helpers", () => {
  it("lists the stations an order touches", () => {
    const st = stationsForOrder(
      [item("كنتاكي 3 قطع", "cat-kfc"), item("زنجر بوفالو", "cat-zinger"), item("رانش", "cat-sauce")],
      CAT_STATION,
    );
    expect(st).toEqual(["st-grill"]); // both grill items collapse to one station
  });

  it("surfaces items no station will cook", () => {
    // this is the check that would have caught fries being left unrouted
    const orphaned = unroutedItems([item("الويدجز", "cat-fries"), item("جبن", "cat-sauce")], {
      ...CAT_STATION,
      "cat-fries": null,
    });
    expect(orphaned.map((i) => i.name_ar)).toEqual(["الويدجز", "جبن"]);
  });
});
