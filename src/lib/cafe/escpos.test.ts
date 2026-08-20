import { describe, it, expect } from "vitest";
import { encodeText, renderTicket, qrCode, drawerKick, pairLine, COLS_80MM } from "./escpos";
import { routeOrder, type PrinterRow, type StationRow } from "./print-routing";

const STATIONS: StationRow[] = [{ id: "st-grill", name_ar: "الشواية" }];
const PRINTERS: PrinterRow[] = [
  { id: "p1", name_ar: "الكاشير", kind: "receipt", station_id: null, is_active: true, copies: 1 },
  { id: "p4", name_ar: "الشواية", kind: "station", station_id: "st-grill", is_active: true, copies: 1 },
];

function tickets() {
  return routeOrder({
    order: {
      orderId: "3f2b1c88-9a4d-4e11-b7c2-0d5e6f7a8b90",
      orderNumber: "042",
      pickupCode: "7391",
      channel: "cashier",
      tableNo: null,
      note: null,
      subtotal: 12000,
      discount: 0,
      extras: [],
      total: 12000,
      dateTime: "20/08/2026 19:31",
      cashierName: "أحمد",
    },
    items: [{ name_ar: "مايتي زنجر", flavor_ar: null, qty: 2, unit_price: 6000, category_id: "cat-zinger" }],
    printers: PRINTERS,
    stations: STATIONS,
    categoryStation: { "cat-zinger": "st-grill" },
  });
}

describe("cp1256 encoding", () => {
  it("passes ASCII through as-is", () => {
    expect(encodeText("Station 750", "cp1256")).toEqual([...Buffer.from("Station 750", "ascii")]);
  });

  it("maps Arabic letters into the 1256 high range", () => {
    // ب=0xC8  ر=0xD1  ج=0xCC  ر=0xD1 — unshaped, the printer joins them
    expect(encodeText("برجر", "cp1256")).toEqual([0xc8, 0xd1, 0xcc, 0xd1]);
  });

  it("substitutes a visible ? for glyphs 1256 cannot carry", () => {
    // an emoji has no CP1256 byte; a gap must be visible, not silent
    expect(encodeText("★", "cp1256")).toEqual([0x3f]);
  });

  it("utf8 mode ships SHAPED letters, so the bytes differ from cp1256", () => {
    const utf8 = encodeText("برجر", "utf8");
    expect(utf8).not.toEqual(encodeText("برجر", "cp1256"));
    // presentation forms live in U+FExx → 3-byte UTF-8 sequences starting 0xEF
    expect(utf8[0]).toBe(0xef);
  });
});

describe("ticket rendering", () => {
  it("starts every slip with ESC @ and ends with a cut", () => {
    const bytes = renderTicket(tickets()[0]);
    expect([bytes[0], bytes[1]]).toEqual([0x1b, 0x40]);
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("kicks the drawer only when asked", () => {
    const kick = [0x1b, 0x70, 0x00, 0x19, 0xfa];
    const has = (b: Uint8Array) => [...b].join(",").includes(kick.join(","));
    expect(has(renderTicket(tickets()[0], { kickDrawer: true }))).toBe(true);
    expect(has(renderTicket(tickets()[0]))).toBe(false);
  });

  it("prints a QR on the receipt only when routeOrder supplied one", () => {
    const withQr = renderTicket({ ...tickets()[0], qr: "https://station.iq/t/042" });
    // GS ( k … 0x31 0x51 0x30 is the "print stored symbol" tail
    expect([...withQr].join(",")).toContain([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30].join(","));
    expect([...renderTicket(tickets()[0])].join(",")).not.toContain([0x31, 0x51, 0x30].join(","));
  });

  it("renders a station ticket without any price", () => {
    const grill = tickets().find((t) => t.kind === "station")!;
    const bytes = renderTicket(grill, { codepage: "utf8" });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("2"); // the quantity
    expect(text).not.toContain("12,000"); // never the money
    expect(text).not.toContain("6,000");
  });

  it("puts the total on the customer receipt", () => {
    const receipt = tickets().find((t) => t.kind === "receipt")!;
    const text = new TextDecoder().decode(renderTicket(receipt, { codepage: "utf8" }));
    expect(text).toContain("12,000");
  });

  it("never lets a two-column line exceed the paper width", () => {
    // measured on the helper, not on decoded bytes: ESC/POS sequences contain
    // printable characters (the ! in GS ! n) that would corrupt the count
    expect(pairLine("الإجمالي", "12,000", COLS_80MM)).toHaveLength(COLS_80MM);
    const long = pairLine("بيتزا دجاج الباربيكيو محشية الأطراف وجبة كبيرة", "36,000", COLS_80MM);
    expect([...long]).toHaveLength(COLS_80MM);
    expect(long).toContain("36,000"); // the price survives, the name is clipped
    expect(long).toContain("…");
  });

});

describe("raw commands", () => {
  it("builds a well-formed QR block with a correct length prefix", () => {
    const data = "https://station.iq";
    const bytes = qrCode(data);
    const i = bytes.indexOf(0x50); // the 'store' function byte
    // pL/pH sit two bytes before 0x31 0x50 and must equal payload + 3
    expect(bytes[i - 3]).toBe(data.length + 3);
  });

  it("emits a standalone drawer pulse", () => {
    expect([...drawerKick()]).toEqual([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });
});
