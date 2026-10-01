/**
 * خلاصة الطلب كما تُقال للزبون — ملفٌّ نقيّ: لا شبكة ولا قاعدة ولا React.
 *
 * رسالة التأكيد كانت رقماً وحده («طلبك رقم ٠٤٢ انقبل»). وطلبت الإدارة أن
 * تحمل ما طلبه ومجموعه وكيف سيصله — فالزبون يراجع طلبه قبل أن يُطبخ، لا بعد
 * أن يستلمه.
 *
 * والنصّ هنا وحده ليُختبر بلا قاعدة، كما فُعل بـ`review-ask.ts` و`wall.ts`.
 */

export type SummaryItem = {
  name_ar: string;
  flavor_ar?: string | null;
  qty: number;
  line_total: number;
};

/** أكثر من هذا يصير جداراً على شاشة هاتف، والباقي يُعدّ ولا يُسرد */
const MAX_LINES = 8;

/**
 * كيف سيصل الطلب — بالعربية التي يفهمها الزبون لا باسم القناة.
 *
 * ⚠ والنوع ليس في عمودٍ واحد: «على ميز» و«سفري» و«موقف السيارة» وسومٌ نصّية
 * داخل `note` كتبها `serve_my_order` و`park_my_order` (0108/0109/0103)، لأنها
 * اختياراتٌ بعد الطلب لا قناةٌ يُنشأ بها. فمن قرأ القناة وحدها قال «استلام»
 * لزبونٍ اختار أن يجلس على طاولة.
 */
export function serveLabel(
  channel: string | null | undefined,
  note?: string | null,
  tableNo?: string | null,
): string {
  const n = note ?? "";
  if (channel === "delivery") return "🛵 توصيل إلى عنوانك";
  if (channel === "curbside") {
    const spot = n.match(/📍\s*([^·]+)/)?.[1]?.trim();
    return spot ? `🚗 من السيارة — ${spot}` : "🚗 استلام من السيارة";
  }
  if (channel === "takeaway") return "🥡 سفري";
  if (channel === "qr" || channel === "kiosk") {
    return tableNo ? `🍽 على الطاولة ${tableNo}` : "🍽 داخل المطعم";
  }
  // استلام: الاختيار بعد الطلب هو الذي يحسم
  if (n.includes("🍽")) return "🍽 نجهّزه على ميز";
  if (n.includes("🥡")) return "🥡 سفري";
  return "🛍 استلام من الكاونتر";
}

/** سطرٌ لكل صنف: «٢ × برجر لحم بالجبن — ١٢,٠٠٠» */
export function itemLines(items: SummaryItem[]): string[] {
  const shown = items.slice(0, MAX_LINES);
  const lines = shown.map((it) => {
    const name = it.flavor_ar ? `${it.name_ar} — ${it.flavor_ar}` : it.name_ar;
    return `• ${it.qty} × ${name} — ${fmt(it.line_total)}`;
  });
  const rest = items.length - shown.length;
  if (rest > 0) lines.push(`• و${rest} صنف آخر`);
  return lines;
}

/** أرقام إنجليزية بفواصل — نفس ما يراه على الإيصال */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * المجموع النهائي: ما يدفعه فعلاً.
 *
 * والخصم يُذكر مستقلّاً إن وُجد — رقمٌ أقلّ بلا سببٍ مكتوب يُقرأ خطأً.
 */
export function totalLines(o: { subtotal: number; discount?: number | null; extra?: number | null }): string[] {
  const discount = o.discount ?? 0;
  const extra = o.extra ?? 0;
  const total = Math.max(0, o.subtotal - discount + extra);
  const out: string[] = [];
  if (discount > 0) {
    out.push(`المجموع: ${fmt(o.subtotal + extra)}`, `الخصم: −${fmt(discount)}`);
  }
  out.push(`💵 <b>الإجمالي: ${fmt(total)} د.ع</b>`);
  return out;
}

/** رسالة التأكيد كاملةً — رقمٌ، ثم ما طلبه، ثم كم، ثم كيف يصله */
export function confirmText(input: {
  orderNo: string;
  items: SummaryItem[];
  subtotal: number;
  discount?: number | null;
  extra?: number | null;
  channel: string | null | undefined;
  note?: string | null;
  tableNo?: string | null;
}): string {
  const head = `✅ طلبك رقم <b>${input.orderNo}</b> انقبل وبدينا بيه.`;
  const parts = [head];
  if (input.items.length) parts.push("", "🧾 <b>طلبك</b>", ...itemLines(input.items));
  parts.push("", ...totalLines(input));
  parts.push("", serveLabel(input.channel, input.note, input.tableNo));
  parts.push(
    input.channel === "delivery" ? "نخبرك لمن يطلع للتوصيل." : "نخبرك لمن يجهز.",
  );
  return parts.join("\n");
}
