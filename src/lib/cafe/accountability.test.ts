import { describe, it, expect } from "vitest";
import { renderTicket } from "./escpos";
import { routeOrder, type PrintOrder, type PrinterRow, type StationRow } from "./print-routing";
import { shapeArabic } from "./arabic-shape";

/**
 * The two rules the operating spec is explicit about:
 *   · every assembly ticket names the cashier AND the expediter
 *   · a delivery ticket carries the customer's phone and address prominently
 * Both are the kind of thing that silently regresses when the layout is edited,
 * so they get assertions rather than a code comment.
 */

const STATIONS: StationRow[] = [{ id: "st-burger", name_ar: "محطة البرجر" }];
const PRINTERS: PrinterRow[] = [
  { id: "p1", name_ar: "الكاشير", kind: "receipt", station_id: null, is_active: true, copies: 1 },
  { id: "p3", name_ar: "البرجر", kind: "station", station_id: "st-burger", is_active: true, copies: 1 },
  { id: "p5", name_ar: "التجهيز", kind: "expediter", station_id: null, is_active: true, copies: 1 },
];

function build(over: Partial<PrintOrder> = {}) {
  const order: PrintOrder = {
    orderId: "3f2b1c88-9a4d-4e11-b7c2-0d5e6f7a8b90",
    orderNumber: "907",
    pickupCode: "4412",
    channel: "cashier",
    tableNo: null,
    note: null,
    subtotal: 8500,
    discount: 0,
    extras: [],
    total: 8500,
    dateTime: "20/08 19:31",
    cashierName: "أحمد",
    expediterName: "مصطفى",
    ...over,
  };
  return routeOrder({
    order,
    items: [{ name_ar: "ماشروم برجر", flavor_ar: null, qty: 1, unit_price: 8500, category_id: "cat-burger" }],
    printers: PRINTERS,
    stations: STATIONS,
    categoryStation: { "cat-burger": "st-burger" },
  });
}

const asText = (t: ReturnType<typeof build>[number]) =>
  new TextDecoder().decode(renderTicket(t, { codepage: "utf8" }));

// utf8 mode prints SHAPED, reversed presentation forms — the whole point of
// arabic-shape.ts — so an assertion has to look for what actually goes on paper
const printed = (arabic: string) => shapeArabic(arabic);

describe("print accountability", () => {
  it("names both the cashier and the expediter on the assembly ticket", () => {
    const exp = build().find((t) => t.kind === "expediter")!;
    const text = asText(exp);
    expect(text).toContain(printed("أحمد"));
    expect(text).toContain(printed("مصطفى"));
  });

  // كان يطبع «غير محدّد». صاحب المحل أزال اختيار المجهّز من الكاشير: التجهيز
  // يجري في المطبخ على تذكرة كاملة، فسطرٌ يقول «لا أحد» ضجيج لا محاسبة.
  // الكاشير يبقى مسمّى دائماً — هو من أخذ المال.
  it("omits the expediter line entirely when no one is on shift, and still names the cashier", () => {
    const exp = build({ expediterName: null }).find((t) => t.kind === "expediter")!;
    const text = asText(exp);
    expect(text).not.toContain(printed("غير محدّد"));
    expect(text).not.toContain(printed("المجهّز"));
    expect(text).toContain(printed("أحمد"));
  });

  it("carries the expediter name to every ticket, not just the assembly slip", () => {
    for (const t of build()) expect(t.order.expediterName).toBe("مصطفى");
  });
});

describe("delivery details", () => {
  const delivery = () =>
    build({
      channel: "delivery",
      customerName: "أبو علي",
      customerPhone: "07801234567",
      addressNote: "الرمادي — شارع المستودع، قرب فلكة الفرسان",
    });

  it("forces the customer block for the two modes that never come inside", () => {
    // delivery and curbside: a runner has to FIND this person, so the block is
    // unconditional. pickup walks to the counter — it only gets the block when
    // there is actually a phone to print (see the escpos condition).
    expect(delivery()[0].order.isDelivery).toBe(true);
    expect(build({ channel: "curbside" })[0].order.isDelivery).toBe(true);
    expect(build({ channel: "pickup" })[0].order.isDelivery).toBe(false);
    expect(build()[0].order.isDelivery).toBe(false);
  });

  it("prints the phone and address on EVERY ticket, kitchen included", () => {
    // the cook does not deliver, but the bag does — and a slip that reaches the
    // driver without an address is a lost order
    for (const t of delivery()) {
      const text = asText(t);
      expect(text).toContain("07801234567");
      expect(text).toContain(printed("شارع المستودع"));
      expect(text).toContain(printed("أبو علي"));
    }
  });

  it("puts the address BEFORE the item lines", () => {
    const receipt = delivery().find((t) => t.kind === "receipt")!;
    const text = asText(receipt);
    expect(text.indexOf("07801234567")).toBeLessThan(text.indexOf(printed("ماشروم برجر")));
  });

  it("does not print a customer block on an ordinary counter sale", () => {
    const text = asText(build().find((t) => t.kind === "receipt")!);
    expect(text).not.toContain("07801234567");
  });
});

describe("delivery company", () => {
  // the expediter packs a Toters bag differently from a counter order, so the
  // company is on the slip before the items — on the receipt and the assembly ticket
  it("prints the company name, before the items, on every ticket", () => {
    for (const t of build({ partnerName: "توترز" })) {
      const text = asText(t);
      expect(text.indexOf(printed("توترز"))).toBeGreaterThan(-1);
      expect(text.indexOf(printed("توترز"))).toBeLessThan(text.indexOf(printed("ماشروم برجر")));
    }
  });

  it("prints nothing of the kind on a counter sale", () => {
    for (const t of build()) expect(asText(t)).not.toContain(printed("توترز"));
  });
});

describe("order note", () => {
  // «بدون بصل» reached the receipt and not the kitchen. Whatever the printer
  // did with the tail of the slip, the note now precedes the food on every
  // ticket — the cook reads it before the first item, not after the last.
  it("prints the note BEFORE the first item on every ticket, kitchen and assembly included", () => {
    const tickets = build({ note: "بدون مخلل" });
    expect(tickets.map((t) => t.kind).sort()).toEqual(["expediter", "receipt", "station"]);
    for (const t of tickets) {
      const text = asText(t);
      const note = text.indexOf(printed("بدون مخلل"));
      expect(note).toBeGreaterThan(-1);
      expect(note).toBeLessThan(text.indexOf(printed("ماشروم برجر")));
    }
  });
});
