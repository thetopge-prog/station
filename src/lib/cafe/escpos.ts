/**
 * ESC/POS rendering — turn a routed Ticket into the bytes a thermal printer
 * understands.
 *
 * Pure: takes a Ticket, returns bytes. The transport (TCP to a printer IP, or a
 * Windows share) lives in the local print agent, because a Netlify-hosted
 * server can never reach a printer on the shop LAN.
 *
 * ── Arabic ────────────────────────────────────────────────────────────────
 * Two encodings, because thermal printers disagree and the shop has not bought
 * theirs yet. /printers prints a test slip on each so the owner picks whichever
 * comes out readable:
 *
 *   cp1256 — send UNSHAPED Arabic in Windows-1256 bytes and let the printer's
 *            own Arabic firmware join the letters. Most common on the cheap
 *            Arabic-market printers.
 *   utf8   — send Arabic we shaped OURSELVES (see arabic-shape.ts) as UTF-8.
 *            For printers with a Unicode font but no shaping engine.
 *
 * Getting this wrong is not subtle: the receipt prints ب ر ج ر instead of برجر.
 */

import type { Ticket } from "./print-routing";
import { shapeArabic } from "./arabic-shape";
import { formatIqd } from "./money";

export type Codepage = "cp1256" | "utf8";

/** 80mm roll at font A ≈ 42 columns; 58mm ≈ 32. */
export const COLS_80MM = 42;

/**
 * Every code-page slot worth trying, 0 to 55.
 *
 * The first pass offered five likely numbers and the shop reported "different
 * languages each time" — Cyrillic, Greek, Thai — and never Arabic. Which is
 * fair: CP864 and CP1256 sit wherever a given firmware felt like putting them,
 * and five guesses out of two hundred was optimistic.
 *
 * So scan the whole plausible range. It is a long slip, printed once in the
 * life of a printer, and it ends the question — either a line comes out Arabic
 * or none does, and "none does" is itself the answer: that printer has no
 * Arabic page and the text has to go as an image instead.
 */
export const ARABIC_CODEPAGES = Array.from({ length: 56 }, (_, i) => i);

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0],
  alignCenter: [ESC, 0x61, 1],
  alignRight: [ESC, 0x61, 2],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  /** GS ! n — width/height multiplier packed as (w-1)<<4 | (h-1) */
  size: (w: number, h: number) => [GS, 0x21, ((w - 1) << 4) | (h - 1)],
  feed: (n: number) => [ESC, 0x64, n],
  /** GS V B n — partial cut, leaving a tab so the slip does not fall */
  cut: [GS, 0x56, 0x42, 0x00],
  /** ESC p m t1 t2 — the cash-drawer pulse, same bytes drawer-agent.ps1 used */
  kick: [ESC, 0x70, 0x00, 0x19, 0xfa],
  /** ESC t n — select character code table (n is printer-specific) */
  codepage: (n: number) => [ESC, 0x74, n],
  /**
   * FS . — cancel Kanji (double-byte) character mode.
   *
   * These 80mm units are built for the Chinese market and power up expecting
   * GB18030, so every byte above 0x7F is read as the FIRST HALF of a Chinese
   * character. The shop's first real receipt came out as a column of Chinese:
   * the numbers, the QR and the layout were all correct, only the Arabic was
   * being decoded two bytes at a time.
   *
   * ESC @ does not clear it — it resets to the printer's own default, which IS
   * this. Sent on every ticket, and harmless on a printer that has no such mode.
   */
  cancelKanji: [0x1c, 0x2e],
} as const;

/**
 * Windows-1256 high range, 0x80–0xFF. Only the Arabic block is exercised here;
 * the Latin accents are included so a stray "é" does not turn the rest of the
 * line into question marks.
 */
const CP1256_HIGH =
  "€پ‚ƒ„…†‡ˆ‰ٹ‹Œچژڈ" +
  "گ‘’“”•–—ک™ڑ›œ‌‍ں" +
  " ،¢£¤¥¦§¨©ھ«¬­®¯" +
  "°±²³´µ¶·¸¹؛»¼½¾؟" +
  "ۀءآأؤإئابةتثجحخد" +
  "ذرزسشصض×طظعغـفقك" +
  "àلâمنهوçèéêëىيîï" +
  "ًٌٍَôُِ÷ّùْûü‎‏ے";

let cp1256Map: Map<string, number> | null = null;
function cp1256Byte(ch: string): number | undefined {
  if (!cp1256Map) {
    cp1256Map = new Map();
    [...CP1256_HIGH].forEach((c, i) => cp1256Map!.set(c, 0x80 + i));
  }
  return cp1256Map.get(ch);
}

/** Encode one line of text for the target printer. */
export function encodeText(text: string, codepage: Codepage): number[] {
  if (codepage === "utf8") {
    // we do the joining, the printer just draws glyphs
    return [...new TextEncoder().encode(shapeArabic(text))];
  }
  // cp1256: hand the printer the ORIGINAL letters and let its firmware join them
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const b = cp1256Byte(ch);
    // '?' rather than dropping: a visible gap tells staff a glyph is missing
    out.push(b ?? 0x3f);
  }
  return out;
}

/**
 * One line of a slip, as CONTENT rather than as bytes.
 *
 * The bytes path asks the printer to know Arabic. This one does not: the till
 * agent draws these lines with a Windows font and sends the result as a
 * picture, so the printer only ever has to print dots. That is the whole fix —
 * the shop's printer turned out to have no Arabic code page at any of the 56
 * slots, and no amount of choosing between them was ever going to produce
 * Arabic.
 */
export type DocLine = { t: string; align: "r" | "c" | "l"; bold: boolean; w: number; h: number };
export type TicketDoc = { lines: DocLine[]; qr: string | null; kick: boolean };

/** Small builder so the layout below reads like the slip it produces. */
class Slip {
  private bytes: number[] = [];
  /** the same slip as content, for the agent to draw — see TicketDoc */
  readonly doc: DocLine[] = [];
  private align: "r" | "c" | "l" = "r";
  private isBold = false;
  private w = 1;
  private h = 1;
  constructor(
    private codepage: Codepage,
    readonly cols: number,
  ) {}

  raw(...b: readonly number[]) {
    this.bytes.push(...b);
    return this;
  }
  text(s: string) {
    this.bytes.push(...encodeText(s, this.codepage));
    return this;
  }
  line(s = "") {
    this.doc.push({ t: s, align: this.align, bold: this.isBold, w: this.w, h: this.h });
    return this.text(s).raw(0x0a);
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.cols));
  }
  center() {
    this.align = "c";
    return this.raw(...CMD.alignCenter);
  }
  right() {
    this.align = "r";
    return this.raw(...CMD.alignRight);
  }
  left() {
    this.align = "l";
    return this.raw(...CMD.alignLeft);
  }
  bold(on: boolean) {
    this.isBold = on;
    return this.raw(...(on ? CMD.boldOn : CMD.boldOff));
  }
  size(w: number, h: number) {
    this.w = w;
    this.h = h;
    return this.raw(...CMD.size(w, h));
  }
  /**
   * Two columns on one line. RTL slips read right-to-left, so `start` is the
   * right-hand side; padding goes in the middle where it belongs.
   */
  pair(start: string, end: string) {
    return this.line(pairLine(start, end, this.cols));
  }
  done(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Arabic presentation forms are single-width; this is a length, not a width. */
function visualLen(s: string): number {
  return [...s].length;
}

/**
 * Lay two values across one line of `cols` characters.
 *
 * The amount on the left is never sacrificed — a receipt that hides a price is
 * worse than one with a clipped item name — so when the pair does not fit it is
 * the label that gets ellipsised. Without this a long name pushes the total
 * onto a wrapped second line and the slip stops looking like a receipt.
 */
export function pairLine(start: string, end: string, cols: number): string {
  const endLen = visualLen(end);
  const room = cols - endLen - 1; // at least one space between the columns
  let left = start;
  if (visualLen(left) > room) {
    left = room > 1 ? [...left].slice(0, room - 1).join("") + "…" : "";
  }
  const gap = Math.max(1, cols - visualLen(left) - endLen);
  return left + " ".repeat(gap) + end;
}

export type RenderOptions = {
  codepage?: Codepage;
  cols?: number;
  /** ESC t byte — printer-specific, discovered with a test print */
  codepageCmd?: number | null;
  /** open the cash drawer with this slip (cashier receipt, cash payments only) */
  kickDrawer?: boolean;
  shopNameAr?: string;
  shopCityAr?: string;
};

/**
 * Render a routed ticket.
 *
 * A kitchen ticket and a customer receipt are the same function on purpose:
 * they share the header, the order number and the cut, and differ only in
 * whether `ticket.money` is present — which routeOrder already decided. Keeping
 * one renderer means a change to the order-number layout cannot drift between
 * the slip the customer holds and the slip the cook reads.
 */
export function renderTicket(ticket: Ticket, opts: RenderOptions = {}): Uint8Array {
  const codepage = opts.codepage ?? "cp1256";
  const cols = opts.cols ?? COLS_80MM;
  const s = new Slip(codepage, cols);
  buildTicket(s, ticket, opts);
  return s.done();
}

/** The layout itself — written once, emitted twice (bytes, and content). */
function buildTicket(s: Slip, ticket: Ticket, opts: RenderOptions): void {

  s.raw(...CMD.init, ...CMD.cancelKanji);
  if (opts.codepageCmd != null) s.raw(...CMD.codepage(opts.codepageCmd));

  // ── header ──────────────────────────────────────────────────────────────
  s.center();
  if (ticket.kind === "receipt") {
    s.size(2, 2).bold(true).line(opts.shopNameAr ?? "ستيشن").bold(false).size(1, 1);
    if (opts.shopCityAr) s.line(opts.shopCityAr);
  } else {
    // A cook glances at this from a metre away: the station name is the biggest
    // thing on the slip, above even the order number.
    s.size(2, 2).bold(true).line(ticket.headingAr).bold(false).size(1, 1);
  }
  s.rule("=");

  // ── order number ────────────────────────────────────────────────────────
  s.size(3, 3).bold(true).line(ticket.order.orderNumber).bold(false).size(1, 1);
  if (ticket.order.pickupCode) {
    s.size(2, 1).line(`رمز: ${ticket.order.pickupCode}`).size(1, 1);
  }
  if (ticket.order.tableNo) {
    s.size(2, 1).bold(true).line(`طاولة ${ticket.order.tableNo}`).bold(false).size(1, 1);
  } else if (ticket.kind !== "receipt") {
    s.line(ticket.headingAr === ticket.order.channel ? "" : channelLabel(ticket.order.channel));
  }

  s.right();
  s.pair(ticket.order.dateTime, channelLabel(ticket.order.channel));

  // ── accountability ──────────────────────────────────────────────────────
  // Who took the money and who bagged it, printed on the assembly ticket in
  // full size. This is the whole point of the expediter slip: when a customer
  // comes back with the wrong bag, the paper names two people.
  if (ticket.kind === "expediter") {
    s.rule();
    s.bold(true);
    s.pair("الكاشير", ticket.order.cashierName ?? "—");
    s.pair("المجهّز", ticket.order.expediterName ?? "غير محدّد");
    s.bold(false);
  } else {
    s.pair("الكاشير", ticket.order.cashierName ?? "—");
  }

  // ── delivery details, before the items ──────────────────────────────────
  // On a delivery slip the address matters more than the food does: put it
  // where the driver sees it first, at double height, not in a footer.
  if (ticket.order.isDelivery || ticket.order.addressNote || ticket.order.customerPhone) {
    s.rule("*");
    s.center().bold(true).size(1, 2);
    if (ticket.order.customerName) s.line(ticket.order.customerName);
    if (ticket.order.customerPhone) s.line(ticket.order.customerPhone);
    s.size(1, 1);
    if (ticket.order.addressNote) s.size(1, 2).line(ticket.order.addressNote).size(1, 1);
    s.bold(false).right();
    s.rule("*");
  } else {
    s.rule();
  }

  // ── lines ───────────────────────────────────────────────────────────────
  for (const l of ticket.lines) {
    const name = l.flavor ? `${l.name} (${l.flavor})` : l.name;
    if (l.amount == null) {
      // kitchen slip: quantity is what matters, so it is doubled in size and
      // money is absent by construction (see routeOrder invariant 2)
      s.size(2, 2).bold(true).line(`${l.qty} × ${name}`).bold(false).size(1, 1);
    } else {
      s.pair(`${name} ×${l.qty}`, formatIqd(l.amount));
    }
  }

  // ── note ────────────────────────────────────────────────────────────────
  if (ticket.order.note) {
    s.rule();
    s.size(1, 2).bold(true).line(`ملاحظة: ${ticket.order.note}`).bold(false).size(1, 1);
  }

  // ── money (receipt only) ────────────────────────────────────────────────
  if (ticket.money) {
    s.rule();
    s.pair("المجموع", formatIqd(ticket.money.subtotal));
    if (ticket.money.extra > 0) s.pair("إضافات", formatIqd(ticket.money.extra));
    if (ticket.money.discount > 0) s.pair("الخصم", `-${formatIqd(ticket.money.discount)}`);
    s.bold(true).size(2, 2).pair("الإجمالي", formatIqd(ticket.money.total)).size(1, 1).bold(false);
  }

  // ── footer ──────────────────────────────────────────────────────────────
  s.center();
  if (ticket.qr) {
    s.raw(...qrCode(ticket.qr));
    s.line("تتبّع طلبك");
  }
  if (ticket.kind === "receipt") {
    s.rule();
    s.line("شكراً لزيارتكم");
  }
  // credit line, on every slip — parity with the browser receipt
  s.rule();
  s.line("تم تنفيذ وتصميم هذا النظام");
  s.line("مركز الرؤية للابتكار الرقمي");

  s.raw(...CMD.feed(3));
  if (opts.kickDrawer) s.raw(...CMD.kick);
  s.raw(...CMD.cut);
}

/**
 * The same slip, as content for the agent to DRAW.
 *
 * Built by the same function that builds the bytes, so the two can never drift:
 * one pass, one layout, two outputs. The agent turns this into a picture with a
 * Windows font, and the printer is asked only to print dots — no code page, no
 * Kanji mode, no firmware roulette, and Arabic that is joined by the same
 * shaping engine Word uses.
 */
export function renderTicketDoc(ticket: Ticket, opts: RenderOptions = {}): TicketDoc {
  const cols = opts.cols ?? COLS_80MM;
  const s = new Slip("utf8", cols);
  buildTicket(s, ticket, opts);
  return { lines: s.doc, qr: ticket.qr ?? null, kick: opts.kickDrawer === true };
}

function channelLabel(channel: string): string {
  return (
    { cashier: "كاشير", qr: "طاولة", kiosk: "كشك", delivery: "توصيل", pickup: "استلام", curbside: "من السيارة" }[channel] ??
    channel
  );
}

/**
 * Native ESC/POS QR (GS ( k, model 2). Uses the printer's own encoder rather
 * than rasterising an image: it is a few bytes instead of a few kilobytes, and
 * it prints identically on every printer that supports the command.
 */
export function qrCode(data: string, moduleSize = 6): number[] {
  const payload = [...new TextEncoder().encode(data)];
  const len = payload.length + 3; // pk + the two function bytes
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  return [
    // model 2
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    // module size
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize,
    // error correction level M
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    // store the payload
    GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...payload,
    // print it
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/** Drawer pulse on its own, for a printer that is not printing anything. */
export function drawerKick(): Uint8Array {
  return new Uint8Array([...CMD.init, ...CMD.kick]);
}

/**
 * A calibration slip: the same Arabic word in both encodings plus a QR, so the
 * owner can look at one piece of paper and tell /printers which setting their
 * hardware actually understands.
 */
/**
 * The test slip, which is really a code-page scan.
 *
 * Which number selects Arabic differs by firmware — 22, 32, 37 and 41 are all
 * CP1256 or CP864 on one clone or another, and no datasheet in the shop says
 * which. So rather than guess, print the same Arabic line under each candidate,
 * labelled, and let the owner read the paper: whichever line is Arabic, that is
 * the number for this printer.
 */
/**
 * The calibration slip, with nothing left to calibrate.
 *
 * It used to print the same Arabic line under 56 code pages and ask the owner
 * which one came out readable. On the shop's printer, none did — it has no
 * Arabic page at all. So the question is gone along with every setting behind
 * it: this is drawn as a picture like every other slip, and it either prints or
 * the printer is unplugged.
 */
export function testSlipDoc(printerNameAr: string): TicketDoc {
  const s = new Slip("utf8", COLS_80MM);
  s.center().size(2, 2).bold(true).line("ستيشن").bold(false).size(1, 1);
  s.line(printerNameAr);
  s.rule("=");
  s.line("برجر بالجبن — زنجر بوفالو");
  s.line("بيتزا سوبريم ١٢٬٠٠٠ د.ع");
  s.line("Station 7,750 IQD");
  s.rule();
  s.line("إن قرأتَ هذا السطر فالطابعة جاهزة");
  return { lines: s.doc, qr: "https://station.iq", kick: false };
}

/**
 * ورقة التعريف — الرقم الذي يقول أي طابعة هذه.
 *
 * أسماء ويندوز على هذا الجهاز POS80 و POS80-25 و POS-24 و POS-23: حرفان
 * بينها، وكل طابعة في غرفة أخرى. فاختيارها من قائمة تخمين لا ربط — وقد قالها
 * صاحب المحل بنفسه: «عشوائية بالربط».
 *
 * فالطريقة الوحيدة الموثوقة أن تسأل الورق: يُطبع رقم كبير على كل طابعة، ويمشي
 * المركِّب فيرى أي رقم خرج عند فرن البيتزا، ثم يضغط ذلك الرقم. لا حفظ لأسماء
 * ولا مطابقة من الذاكرة — الجهاز نفسه يقول من هو.
 */
export function identifyDoc(index: number, share: string): TicketDoc {
  const s = new Slip("utf8", COLS_80MM);
  s.center().line("ستيشن — تعريف الطابعات");
  s.rule("=");
  // ٤×٤ ليُقرأ الرقم من الباب دون الاقتراب من الجهاز
  s.size(4, 4).bold(true).line(String(index)).bold(false).size(1, 1);
  s.rule("=");
  s.line("اضغط هذا الرقم في صفحة التركيب");
  s.line("أمام اسم المطبخ الذي تقف فيه");
  s.rule();
  s.line(share);
  return { lines: s.doc, qr: null, kick: false };
}

/**
 * «جرد اليوم» على شريط ٨٠ ملم — الورقة التي تُوقَّع وتُعلَّق.
 *
 * Built here rather than beside the daily-count action because `Slip` is
 * private to this file. It stays private on purpose: the layout rules — column
 * width, the pair() padding, what the agent's renderer does with `h` — all live
 * here, and a second builder outside would drift from them within a month.
 *
 * The shape is deliberately the same as the Z-report a cashier already reads
 * every night: opening float at the top, money in, money out, expected, counted,
 * difference. Somebody who can read one can read the other without being taught.
 */
export function dailyCountDoc(d: {
  day: string;
  shopName: string;
  opening_float: number;
  cash_sales: number;
  card_sales: number;
  partner_sales: number;
  expenses: number;
  deposited: number;
  debts_issued: number;
  expected_cash: number;
  counted_cash: number;
  orders_count: number;
  guests: number;
  sales: number;
  profit: number | null;
  fixed_cost: number | null;
  net: number | null;
  stock_value: number | null;
  partners_owed: number;
  customers_owed: number;
  note: string | null;
  by: string;
}): TicketDoc {
  const s = new Slip("utf8", COLS_80MM);
  const money = (n: number) => `${new Intl.NumberFormat("en-US").format(Math.round(n))} د.ع`;

  s.center().size(2, 2).bold(true).line("جرد اليوم").bold(false).size(1, 1);
  s.line(d.shopName);
  s.line(d.day);
  s.rule("=");

  s.right();
  s.bold(true).line("الصندوق").bold(false);
  s.pair("المبلغ الافتتاحي", money(d.opening_float));
  s.pair("مبيعات نقدية", money(d.cash_sales));
  s.pair("مصروفات", `- ${money(d.expenses)}`);
  s.pair("مودع للإدارة", `- ${money(d.deposited)}`);
  s.rule();
  s.size(1, 2).bold(true).pair("المتوقع في الصندوق", money(d.expected_cash)).bold(false).size(1, 1);
  s.size(1, 2).bold(true).pair("المعدود فعلاً", money(d.counted_cash)).bold(false).size(1, 1);

  // The number the whole sheet exists for. Named plainly in both directions so
  // nobody has to work out the sign under pressure.
  const diff = d.counted_cash - d.expected_cash;
  s.size(2, 2).bold(true).line(diff === 0 ? "مطابق ✓" : diff > 0 ? `زيادة ${money(diff)}` : `عجز ${money(-diff)}`);
  s.bold(false).size(1, 1);

  s.rule("=");
  s.bold(true).line("خارج الصندوق").bold(false);
  s.pair("مبيعات كي كارد", money(d.card_sales));
  s.pair("على شركات التوصيل", money(d.partner_sales));
  s.pair("ديون صدرت اليوم", money(d.debts_issued));

  s.rule("=");
  s.bold(true).line("اليوم").bold(false);
  s.pair("المبيعات", money(d.sales));
  // الأرباح للإدارة وحدها. الشريط ورقة تُترك على الكاونتر، فحذفها هنا ليس
  // تفصيلاً في الواجهة — بل الفرق بين رقم يُقرأ مرّة ورقم يبقى على الطاولة.
  if (d.profit !== null) s.pair("الأرباح", money(d.profit));
  if (d.fixed_cost !== null) s.pair("الثابتة (أجور وإيجار)", `- ${money(d.fixed_cost)}`);
  if (d.net !== null) {
    s.rule();
    s.bold(true).pair("الصافي", money(d.net)).bold(false);
  }
  s.pair("عدد الطلبات", String(d.orders_count));
  s.pair("عدد الزبائن", String(d.guests));

  s.rule("=");
  s.bold(true).line("أرصدة").bold(false);
  if (d.stock_value !== null) s.pair("قيمة المخزون", money(d.stock_value));
  s.pair("لنا على شركات التوصيل", money(d.partners_owed));
  s.pair("لنا على الزبائن", money(d.customers_owed));

  if (d.note) {
    s.rule("=");
    s.bold(true).line("ملاحظة").bold(false);
    s.line(d.note);
  }

  s.rule("=");
  s.center();
  s.line(`الجرد: ${d.by}`);
  s.line("");
  // A line to sign on — the reason this is printed rather than looked at.
  s.line("التوقيع: ........................");
  return { lines: s.doc, qr: null, kick: false };
}
