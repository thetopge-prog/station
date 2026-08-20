import { formatIqd } from "@/lib/cafe/money";
import { BRAND } from "@/lib/brand";
import { QrBlock } from "./QrBlock";

export type ReceiptData = {
  /** set for cashier sales; drives the 5-printer split in CashierClient */
  orderId?: string;
  orderNumber: string;
  lines: { name: string; flavor?: string | null; qty: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  /** itemized surcharges */
  extras?: { name: string; price: number }[];
  total: number;
  dateTime: string;
  /** table number for dine-in tickets */
  table?: string | null;
  /** ticket heading override (e.g. «طلب جديد — لم يُدفع») */
  heading?: string;
  /** free-text order note («بدون مخلل…») */
  note?: string | null;

  /** كابتن الطلب — who took the money */
  cashierName?: string | null;
  /** اسم المجهّز — from the open shift, fixed by the cashier at start of service */
  expediterName?: string | null;

  /** delivery / curbside customer details */
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  channel?: string | null;
  /** the 3-character code a curbside customer reads out */
  pickupCode?: string | null;

  /** payload for the printed QR — the order id, so the expediter can scan it */
  qr?: string | null;
  /** kitchen/assembly slip: same layout, no money */
  kind?: "receipt" | "assembly";
};

const CHANNEL_AR: Record<string, string> = {
  cashier: "كاشير",
  qr: "طاولة",
  kiosk: "كشك",
  delivery: "توصيل",
  pickup: "استلام",
  curbside: "من السيارة",
};

const dash = { borderTop: "1px dashed #000", margin: "4px 0" } as const;
const solid = { borderTop: "1px solid #000", margin: "4px 0" } as const;
const row = { display: "flex", justifyContent: "space-between", fontSize: "12px" } as const;

/**
 * One labelled fact.
 *
 * Renders nothing when the value is absent — a walk-in's receipt should never
 * print «رقم الهاتف: —», and a blank label is worse than a missing line.
 */
function Field({ label, value, big }: { label: string; value?: string | null; big?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ ...row, fontSize: big ? "13px" : "12px", fontWeight: big ? 800 : 400 }}>
      <span>{label}</span>
      <span style={{ textAlign: "left", maxWidth: "62%" }}>{value}</span>
    </div>
  );
}

/** 80mm thermal receipt. Hidden on screen; the only thing visible when printing
 *  (see the @media print rules in globals.css). */
export function Receipt({ data }: { data: ReceiptData }) {
  const assembly = data.kind === "assembly";
  const curbside = data.channel === "curbside";

  return (
    <div className="receipt-print hidden print:block" dir="rtl">
      {/* 80mm roll — this style unmounts with the receipt */}
      <style>{`@media print { @page { size: 80mm auto; margin: 0; } }`}</style>

      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "16px" }}>{BRAND.nameAr}</div>
      <div style={{ textAlign: "center", fontSize: "11px", marginBottom: "6px" }}>{BRAND.cityAr}</div>
      <div style={dash} />

      {assembly && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "15px", margin: "2px 0" }}>تذكرة التجهيز</div>
      )}
      {data.heading && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "13px", margin: "2px 0" }}>{data.heading}</div>
      )}

      {/* ── header block ─────────────────────────────────────────────────── */}
      <div style={{ ...row, fontSize: "13px", fontWeight: 800 }}>
        <span>رقم الطلب</span>
        <span>{data.orderNumber}</span>
      </div>
      <div style={{ ...row, fontSize: "11px" }}>
        <span>{data.dateTime}</span>
        <span>{data.channel ? CHANNEL_AR[data.channel] ?? data.channel : ""}</span>
      </div>
      <Field label="كابتن الطلب" value={data.cashierName} />
      {/* the expediter comes from the OPEN SHIFT, so the name is known before
          anyone has touched the order — that is the whole reason shifts exist */}
      <Field label="اسم المجهّز" value={data.expediterName ?? (assembly ? "غير محدّد" : null)} />

      {data.table && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "15px", margin: "3px 0" }}>🍽 طاولة {data.table}</div>
      )}

      {/* ── delivery / curbside: whoever carries the bag has to find the person ── */}
      {(data.customerName || data.customerPhone || data.customerAddress) && (
        <>
          <div style={solid} />
          <Field label="الزبون" value={data.customerName} big />
          <Field label="رقم الهاتف" value={data.customerPhone} big />
          {data.customerAddress && (
            <div style={{ fontSize: "13px", fontWeight: 800, marginTop: "2px" }}>العنوان: {data.customerAddress}</div>
          )}
          <div style={solid} />
        </>
      )}

      {/* ── the car code, big enough to read through a windscreen ─────────── */}
      {curbside && data.pickupCode && (
        <div style={{ textAlign: "center", border: "2px solid #000", padding: "4px", margin: "4px 0" }}>
          <div style={{ fontSize: "11px" }}>رمز الاستلام من السيارة</div>
          <div style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "4px" }} dir="ltr">
            {data.pickupCode}
          </div>
          <div style={{ fontSize: "10px" }}>نسخة عند الزبون ونسخة مطبوعة</div>
        </div>
      )}

      <div style={dash} />
      <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ padding: "2px 0" }}>
                {l.name}
                {l.flavor ? ` (${l.flavor})` : ""} ×{l.qty}
              </td>
              {/* an assembly slip carries no money — same invariant as routeOrder */}
              {!assembly && (
                <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{formatIqd(l.unitPrice * l.qty)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {data.note && (
        <div style={{ border: "1px solid #000", padding: "3px 5px", margin: "3px 0", fontWeight: 800, fontSize: "13px" }}>
          📝 {data.note}
        </div>
      )}

      {!assembly && (
        <>
          <div style={dash} />
          <div style={row}>
            <span>المجموع</span>
            <span>{formatIqd(data.subtotal)} د.ع</span>
          </div>
          {data.extras && data.extras.length > 0 && (
            <>
              <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "2px" }}>إضافات:</div>
              {data.extras.map((x, i) => (
                <div key={i} style={row}>
                  <span>+ {x.name}</span>
                  <span>{formatIqd(x.price)} د.ع</span>
                </div>
              ))}
            </>
          )}
          {data.discount > 0 && (
            <div style={row}>
              <span>الخصم</span>
              <span>-{formatIqd(data.discount)} د.ع</span>
            </div>
          )}
          <div style={{ ...row, fontWeight: 800, fontSize: "14px", marginTop: "2px" }}>
            <span>الإجمالي</span>
            <span>{formatIqd(data.total)} د.ع</span>
          </div>
        </>
      )}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0 4px" }} />

      {/* The scannable code. On the assembly slip this is the whole point: the
          expediter scans it and the order goes «جاهز» with no screen touch. */}
      {data.qr && (
        <QrBlock
          value={data.qr}
          size={assembly ? 150 : 110}
          label={assembly ? "امسح عند اكتمال التجهيز" : `${BRAND.nameAr} · ${data.orderNumber}`}
        />
      )}

      {!assembly && <div style={{ textAlign: "center", fontSize: "11px" }}>شكراً لزيارتكم ❤</div>}

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0 3px" }} />
      <div style={{ textAlign: "center", fontSize: "9px", lineHeight: 1.4 }}>
        تم تنفيذ وتصميم هذا النظام
        <br />
        مركز الرؤية للابتكار الرقمي
      </div>
    </div>
  );
}
