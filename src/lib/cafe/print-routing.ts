/**
 * Intelligent print routing — split ONE order into the tickets each printer
 * should receive.
 *
 * Pure: no I/O, no React, no Supabase, no Date.now(). Everything it needs is an
 * argument, so it unit-tests like order.ts / tables.ts / points.ts do.
 *
 * The shape of a Station order:
 *
 *   طلب واحد
 *     ├─ فاتورة الزبون      → طابعة الكاشير   (كل الأصناف + المبالغ + QR)
 *     ├─ تذكرة فرن البيتزا  → البيتزا فقط     (بلا مبالغ)
 *     ├─ تذكرة البرجر       → البرجر فقط      (بلا مبالغ)
 *     ├─ تذكرة الشواية      → كنتاكي + زنجر   (بلا مبالغ)
 *     └─ تذكرة التجهيز      → كل الأصناف      (بلا مبالغ، مع رمز الاستلام)
 *
 * Routing is DATA, not code: an item goes to a station because its category row
 * carries that station_id. Re-assigning fries from the fryer to the grill, or
 * adding a whole new category, is an edit on /printers — never a deploy.
 *
 * Two invariants this module exists to guarantee:
 *   1. A station with no items in this order produces NO ticket. Nobody wants a
 *      blank slip curling out of the pizza oven printer on every burger sale.
 *   2. Money NEVER appears on a station or expediter ticket. Cost/profit is a
 *      security boundary in this system (see 0002_security.sql); prices on a
 *      kitchen slip are also just noise the line cook has to read past.
 */

export type TicketKind = "receipt" | "station" | "expediter";

/** One sold line, already priced by the server (place_order recomputes money). */
export type PrintItem = {
  name_ar: string;
  flavor_ar: string | null;
  qty: number;
  unit_price: number;
  /** categories.id — the routing key. null ⇒ unknown category ⇒ no station. */
  category_id: string | null;
};

export type PrintOrder = {
  /** orders.id — what the expediter ticket's QR encodes so a scan can find it */
  orderId: string;
  /** zero-padded daily number, e.g. "042" */
  orderNumber: string;
  /** the «رمز الأمان» shown on the customer TV; null if generation was skipped */
  pickupCode: string | null;
  channel: "cashier" | "qr" | "kiosk" | "delivery" | "pickup" | "curbside";
  tableNo: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  extras: { name: string; price: number }[];
  total: number;
  /** pre-formatted in Asia/Baghdad by the caller — keeps this module pure */
  dateTime: string;
  cashierName: string | null;
  /** whoever holds the expediter shift — printed for accountability */
  expediterName?: string | null;
  customerPhone?: string | null;
  addressNote?: string | null;
  customerName?: string | null;
};

export type PrinterRow = {
  id: string;
  name_ar: string;
  kind: TicketKind;
  /** required when kind === "station", null otherwise (DB enforces this too) */
  station_id: string | null;
  is_active: boolean;
  copies: number;
};

export type StationRow = { id: string; name_ar: string };

export type TicketLine = {
  name: string;
  flavor: string | null;
  qty: number;
  /** line total in IQD — null on kitchen tickets, which carry no money */
  amount: number | null;
};

export type Ticket = {
  printerId: string;
  printerName: string;
  kind: TicketKind;
  copies: number;
  /** what prints across the top, e.g. «تذكرة الشواية» */
  headingAr: string;
  stationId: string | null;
  stationName: string | null;
  lines: TicketLine[];
  /** null on every non-receipt ticket — see invariant 2 */
  money: { subtotal: number; discount: number; extra: number; total: number } | null;
  /** payload for the receipt QR (order tracking); null elsewhere */
  qr: string | null;
  order: {
    orderNumber: string;
    pickupCode: string | null;
    channel: PrintOrder["channel"];
    tableNo: string | null;
    note: string | null;
    dateTime: string;
    cashierName: string | null;
    expediterName: string | null;
    customerPhone: string | null;
    addressNote: string | null;
    customerName: string | null;
    /** delivery/pickup tickets must carry the customer's details prominently */
    isDelivery: boolean;
  };
};

export type RouteInput = {
  order: PrintOrder;
  items: PrintItem[];
  printers: PrinterRow[];
  stations: StationRow[];
  /** categories.id → categories.station_id (null ⇒ not cooked at a station) */
  categoryStation: Record<string, string | null>;
  /** base URL for the receipt QR, e.g. "https://station.iq/t" */
  trackUrl?: string;
};

const CHANNEL_AR: Record<PrintOrder["channel"], string> = {
  cashier: "كاشير",
  qr: "طاولة (QR)",
  kiosk: "كشك",
  delivery: "توصيل",
  pickup: "استلام",
  curbside: "من السيارة",
};

/** Split one order into the tickets its printers should receive. */
export function routeOrder(input: RouteInput): Ticket[] {
  const { order, items, printers, stations, categoryStation, trackUrl } = input;

  const stationName = new Map(stations.map((s) => [s.id, s.name_ar]));
  const active = printers.filter((p) => p.is_active);
  const meta = {
    orderNumber: order.orderNumber,
    pickupCode: order.pickupCode,
    channel: order.channel,
    tableNo: order.tableNo,
    note: order.note,
    dateTime: order.dateTime,
    cashierName: order.cashierName,
    expediterName: order.expediterName ?? null,
    customerPhone: order.customerPhone ?? null,
    addressNote: order.addressNote ?? null,
    customerName: order.customerName ?? null,
    // curbside counts: the runner needs the phone and the car description to
    // find a customer who never comes inside
    isDelivery: order.channel === "delivery" || order.channel === "curbside",
  };

  const tickets: Ticket[] = [];

  // ── 1. customer receipt — the only ticket that carries money ─────────────
  const receipt = active.find((p) => p.kind === "receipt");
  if (receipt && items.length > 0) {
    tickets.push({
      printerId: receipt.id,
      printerName: receipt.name_ar,
      kind: "receipt",
      copies: receipt.copies,
      headingAr: CHANNEL_AR[order.channel],
      stationId: null,
      stationName: null,
      lines: items.map((it) => ({
        name: it.name_ar,
        flavor: it.flavor_ar,
        qty: it.qty,
        amount: it.unit_price * it.qty,
      })),
      money: {
        subtotal: order.subtotal,
        discount: order.discount,
        extra: order.extras.reduce((s, x) => s + x.price, 0),
        total: order.total,
      },
      qr: trackUrl ? `${trackUrl}/${order.orderNumber}${order.pickupCode ? `-${order.pickupCode}` : ""}` : null,
      order: meta,
    });
  }

  // ── 2. one ticket per station that actually has items ───────────────────
  // Grouped first, so invariant 1 falls out of the data: a station with no
  // items simply never appears as a key here.
  const byStation = new Map<string, PrintItem[]>();
  for (const it of items) {
    const st = it.category_id ? categoryStation[it.category_id] ?? null : null;
    if (!st) continue; // sauces, drinks — nothing to cook
    const arr = byStation.get(st) ?? [];
    arr.push(it);
    byStation.set(st, arr);
  }

  for (const p of active) {
    if (p.kind !== "station" || !p.station_id) continue;
    const mine = byStation.get(p.station_id);
    if (!mine?.length) continue; // invariant 1
    tickets.push({
      printerId: p.id,
      printerName: p.name_ar,
      kind: "station",
      copies: p.copies,
      headingAr: stationName.get(p.station_id) ?? p.name_ar,
      stationId: p.station_id,
      stationName: stationName.get(p.station_id) ?? null,
      lines: mine.map((it) => ({
        name: it.name_ar,
        flavor: it.flavor_ar,
        qty: it.qty,
        amount: null, // invariant 2
      })),
      money: null, // invariant 2
      qr: null,
      order: meta,
    });
  }

  // ── 3. expediter assembly ticket — every item, no money ─────────────────
  // This is the checklist the مجهّز works from, so it lists sauces and drinks
  // too: they are part of the bag even though no station cooks them.
  const exp = active.find((p) => p.kind === "expediter");
  if (exp && items.length > 0) {
    tickets.push({
      printerId: exp.id,
      printerName: exp.name_ar,
      kind: "expediter",
      copies: exp.copies,
      headingAr: "تذكرة التجهيز",
      stationId: null,
      stationName: null,
      lines: items.map((it) => ({
        name: it.name_ar,
        flavor: it.flavor_ar,
        qty: it.qty,
        amount: null, // invariant 2
      })),
      money: null,
      // The zero-touch trigger: the expediter scans this and the order jumps to
      // «جاهز» with no screen contact at all. Raw order id, because a UUID is
      // self-identifying — the scanner handler can tell a real scan from stray
      // keyboard noise by shape alone, with no custom prefix to keep in sync.
      qr: order.orderId,
      order: meta,
    });
  }

  return tickets;
}

/**
 * Which stations this order touches — used by the KDS to decide who to notify
 * and by /printers to warn «هذه الفئة بلا محطة» before a shift starts.
 */
export function stationsForOrder(
  items: PrintItem[],
  categoryStation: Record<string, string | null>,
): string[] {
  const seen = new Set<string>();
  for (const it of items) {
    const st = it.category_id ? categoryStation[it.category_id] ?? null : null;
    if (st) seen.add(st);
  }
  return [...seen];
}

/**
 * Items that will never reach a kitchen printer because their category has no
 * station. Not an error — sauces belong here — but the admin screen surfaces it
 * so a genuinely unrouted category (the Fries gap in the original spec) is
 * visible before service rather than at the counter.
 */
export function unroutedItems(
  items: PrintItem[],
  categoryStation: Record<string, string | null>,
): PrintItem[] {
  return items.filter((it) => !(it.category_id ? categoryStation[it.category_id] ?? null : null));
}
