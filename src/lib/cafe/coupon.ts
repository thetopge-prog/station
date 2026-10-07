/**
 * الكوبونات — الحساب والنصّ، نقيّاً بلا قاعدة ولا شبكة.
 *
 * ملفٌّ نقيّ كـ`review-ask.ts` و`wall.ts`: يُختبَر بلا بيئة، والقرار المالي
 * فيه (كم يُخصم؟ ومتى يُرفض؟) مكتوبٌ مرّةً واحدة.
 *
 * ⚠ والحارس الحقيقي في القاعدة لا هنا: `redeem_coupon` تقفل الصفّ وتَعدّ
 * الاستخدامات، لأن متصفّحاً لا يُؤتمن على عدٍّ يُنقِص مالاً. وهذه نسخةٌ
 * للعرض وللرسائل — وتتطابق معها عمداً حتى لا يرى الزبون رقماً ويُحاسَب بآخر.
 */

export type CouponKind = "amount" | "percent" | "item";

export type Coupon = {
  code: string;
  kind: CouponKind;
  /** مبلغ بالدينار، أو نسبة من ١ إلى ١٠٠، أو سعر الصنف المجاني */
  value: number;
  max_uses: number;
  used_count: number;
  min_order: number | null;
  /** تاريخ آخر يومٍ صالح (شامل)، أو null لبلا نهاية */
  expires_on: string | null;
  is_active: boolean;
};

export type CouponCheck =
  | { ok: true; discount: number }
  | { ok: false; reason: string };

/** ما يُقال للزبون وللكاشير — ورسالةٌ لكل حالة، فـ«غير صالح» لا تُشخَّص */
export const COUPON_SAY = {
  gone: "ما لكينا هذا الرمز.",
  off: "هذا الكوبون موقوف.",
  expired: "انتهت صلاحية هذا الكوبون.",
  used: "هذا الكوبون استُعمل خلص.",
  min: (n: number) => `هذا الكوبون على طلب ${fmt(n)} د.ع فما فوق.`,
  phone: "هذا الكوبون مخصّص لزبونٍ آخر.",
  empty: "اكتب رمز الكوبون.",
} as const;

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** ٦ أحرف بلا I و L و O و 0 و 1 — تُقرأ بالهاتف بلا لبس (أبجدية رمز الاستلام) */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LEN = 6;

export function normaliseCode(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN);
}

/** الافتراضي ٣٠ يوماً — والكاشير يغيّره */
export const DEFAULT_DAYS = 30;

export function expiryFrom(days: number, today = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + Math.max(1, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

/**
 * كم يُخصم من هذا الطلب — أو لماذا لا يُخصم.
 *
 * والخصم لا يتجاوز قيمة الطلب مهما كان الكوبون: `least()` نفسها التي يطبّقها
 * `mark_order_paid` منذ 0059، فلا يخرج مجموعٌ سالب من أي باب.
 */
export function couponDiscount(
  c: Coupon | null | undefined,
  subtotal: number,
  today = new Date().toISOString().slice(0, 10),
): CouponCheck {
  if (!c) return { ok: false, reason: COUPON_SAY.gone };
  if (!c.is_active) return { ok: false, reason: COUPON_SAY.off };
  // التاريخ شامل: كوبونٌ ينتهي اليوم يُقبل اليوم
  if (c.expires_on && c.expires_on < today) return { ok: false, reason: COUPON_SAY.expired };
  if (c.used_count >= c.max_uses) return { ok: false, reason: COUPON_SAY.used };

  const base = Math.max(0, Math.round(subtotal));
  if (c.min_order && base < c.min_order) return { ok: false, reason: COUPON_SAY.min(c.min_order) };

  const raw =
    c.kind === "percent"
      ? Math.round((base * clampPct(c.value)) / 100)
      : Math.max(0, Math.round(c.value));

  return { ok: true, discount: Math.min(base, raw) };
}

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** وصف الكوبون بالعربية — للرسالة وللقائمة وللصفحة، بنصٍّ واحد لا ثلاثة */
export function couponLabel(c: Pick<Coupon, "kind" | "value">, itemName?: string | null): string {
  if (c.kind === "percent") return `خصم ${clampPct(c.value)}٪`;
  if (c.kind === "item") return itemName ? `${itemName} مجاناً` : "صنف مجاني";
  return `خصم ${fmt(c.value)} د.ع`;
}

/**
 * رسالة «أنت عميل مميّز» — تُفتح في واتساب والموظّف يضغط إرسال.
 *
 * ولا حرف «گ» فيها: خطّ النظام لا يحمله فيخرج غريباً عن أخواته — نفس قيد
 * `review-ask.ts`، وحارسه اختبار.
 */
export function couponMessage(input: {
  name?: string | null;
  label: string;
  code: string;
  url: string;
  expiresOn?: string | null;
  minOrder?: number | null;
  uses?: number;
  /** رقم الطلب الذي سبّب التعويض — تعويضٌ يسمّي سببه يُصدَّق */
  about?: string | null;
}): string {
  const name = (input.name ?? "").trim();
  const uses = Math.max(1, input.uses ?? 1);
  return [
    name ? `هلا ${name} 🧡` : "هلا بيك 🧡",
    input.about
      ? `وصلتنا ملاحظتك على طلبك رقم ${input.about}، وآسفين عليها بصراحة.`
      : "انت من زبائننا المميّزين، وحبّينا نقدّم إلك هدية صغيرة من مطعم المحطة:",
    ...(input.about ? ["وحبّينا نعوّضك:"] : []),
    "",
    `🎁 *${input.label}*`,
    `الرمز: *${input.code}*`,
    ...(uses > 1 ? [`يصلح ${uses} مرّات`] : []),
    ...(input.minOrder ? [`على طلب ${fmt(input.minOrder)} د.ع فما فوق`] : []),
    ...(input.expiresOn ? [`صالح لغاية ${input.expiresOn}`] : []),
    "",
    input.url,
    "",
    "اذكر الرمز عند الطلب ويتخصّم عنك 😋",
  ].join("\n");
}
