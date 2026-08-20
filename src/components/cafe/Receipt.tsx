import { formatIqd } from "@/lib/cafe/money";

export type ReceiptData = {
  /** set for cashier sales; drives the 5-printer split in CashierClient */
  orderId?: string;
  orderNumber: string;
  lines: { name: string; flavor?: string | null; qty: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  /** itemized surcharges (extra shot, syrup…) */
  extras?: { name: string; price: number }[];
  total: number;
  dateTime: string;
  /** table number for incoming self-order tickets */
  table?: string | null;
  /** ticket heading override (e.g. «طلب جديد — لم يُدفع») */
  heading?: string;
  /** free-text order note («بدون مخلل…») */
  note?: string | null;
};

/** 80mm thermal receipt. Hidden on screen; the only thing visible when printing
 *  (see the @media print rules in globals.css). */
export function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div className="receipt-print hidden print:block" dir="rtl">
      {/* 80mm roll — applies only while a receipt is mounted (this style unmounts with it) */}
      <style>{`@media print { @page { size: 80mm auto; margin: 0; } }`}</style>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "16px" }}>ستيشن</div>
      <div style={{ textAlign: "center", fontSize: "11px", marginBottom: "6px" }}>الرمادي — العراق</div>
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      {data.heading && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "13px", margin: "2px 0" }}>{data.heading}</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span>رقم الطلب: {data.orderNumber}</span>
        <span>{data.dateTime}</span>
      </div>
      {data.table && (
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "15px", margin: "3px 0" }}>🍽 طاولة {data.table}</div>
      )}
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ padding: "2px 0" }}>
                {l.name}
                {l.flavor ? ` (${l.flavor})` : ""} ×{l.qty}
              </td>
              <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{formatIqd(l.unitPrice * l.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.note && (
        <div style={{ border: "1px solid #000", padding: "3px 5px", margin: "3px 0", fontWeight: 800, fontSize: "13px" }}>
          📝 {data.note}
        </div>
      )}
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span>المجموع</span>
        <span>{formatIqd(data.subtotal)} د.ع</span>
      </div>
      {data.extras && data.extras.length > 0 && (
        <>
          <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "2px" }}>إضافات:</div>
          {data.extras.map((x, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span>+ {x.name}</span>
              <span>{formatIqd(x.price)} د.ع</span>
            </div>
          ))}
        </>
      )}
      {data.discount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
          <span>الخصم</span>
          <span>-{formatIqd(data.discount)} د.ع</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "14px", marginTop: "2px" }}>
        <span>الإجمالي</span>
        <span>{formatIqd(data.total)} د.ع</span>
      </div>
      <div style={{ borderTop: "1px dashed #000", margin: "6px 0 4px" }} />
      <div style={{ textAlign: "center", fontSize: "11px" }}>شكراً لزيارتكم ❤</div>
    </div>
  );
}
