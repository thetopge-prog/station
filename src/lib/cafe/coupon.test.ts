import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  couponDiscount,
  couponLabel,
  couponMessage,
  expiryFrom,
  normaliseCode,
  type Coupon,
} from "./coupon";

const base: Coupon = {
  code: "ABC234",
  kind: "amount",
  value: 5000,
  max_uses: 1,
  used_count: 0,
  min_order: null,
  expires_on: "2026-12-31",
  is_active: true,
};
const C = (over: Partial<Coupon> = {}): Coupon => ({ ...base, ...over });
const TODAY = "2026-10-04";

describe("كم يُخصم", () => {
  it("مبلغ ثابت يُخصم كما هو", () => {
    expect(couponDiscount(C(), 20000, TODAY)).toEqual({ ok: true, discount: 5000 });
  });

  it("والنسبة تُحسب من الطلب", () => {
    expect(couponDiscount(C({ kind: "percent", value: 20 }), 20000, TODAY)).toEqual({ ok: true, discount: 4000 });
  });

  /*
   * الحارس المالي: كوبون ٥,٠٠٠ على طلب ٣,٠٠٠ لا يُخرج مجموعاً سالباً — وهي
   * نفس قاعدة mark_order_paid منذ 0059. ولو اختلف الرقمان لرأى الزبون شيئاً
   * وحوسب بآخر.
   */
  it("ولا يتجاوز الخصمُ قيمةَ الطلب أبداً", () => {
    expect(couponDiscount(C({ value: 5000 }), 3000, TODAY)).toEqual({ ok: true, discount: 3000 });
    expect(couponDiscount(C({ kind: "percent", value: 100 }), 3000, TODAY)).toEqual({ ok: true, discount: 3000 });
  });

  it("ونسبة فوق المئة تُقصّ عند المئة", () => {
    expect(couponDiscount(C({ kind: "percent", value: 500 }), 10000, TODAY)).toEqual({ ok: true, discount: 10000 });
  });
});

describe("متى يُرفض", () => {
  it("رمز غير موجود", () => {
    expect(couponDiscount(null, 10000, TODAY).ok).toBe(false);
  });

  it("وموقوف", () => {
    expect(couponDiscount(C({ is_active: false }), 10000, TODAY).ok).toBe(false);
  });

  it("ومنتهٍ", () => {
    expect(couponDiscount(C({ expires_on: "2026-10-03" }), 10000, TODAY).ok).toBe(false);
  });

  /** التاريخ شامل: من قيل له «صالح لغاية اليوم» يجب أن يُقبل اليوم */
  it("ويومُ الانتهاء نفسه مقبول", () => {
    expect(couponDiscount(C({ expires_on: TODAY }), 10000, TODAY).ok).toBe(true);
  });

  it("وبلا نهاية يبقى صالحاً", () => {
    expect(couponDiscount(C({ expires_on: null }), 10000, TODAY).ok).toBe(true);
  });

  it("واستُنفدت استخداماته", () => {
    expect(couponDiscount(C({ max_uses: 3, used_count: 3 }), 10000, TODAY).ok).toBe(false);
    expect(couponDiscount(C({ max_uses: 3, used_count: 2 }), 10000, TODAY).ok).toBe(true);
  });

  /** الحدّ الأدنى هو ما يمنع «وجبة مجاناً» — وسببُ الرفض يُقال بالرقم */
  it("وتحت الحدّ الأدنى — ويُذكر الحدّ في السبب", () => {
    const r = couponDiscount(C({ min_order: 15000 }), 9000, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("15,000");
  });

  it("وعلى الحدّ تماماً يُقبل", () => {
    expect(couponDiscount(C({ min_order: 15000 }), 15000, TODAY).ok).toBe(true);
  });
});

describe("الرمز", () => {
  /** يُقرأ بالهاتف: بلا I و L و O و 0 و 1 حتى لا يُسمع حرفٌ مكان آخر */
  it("أبجديته بلا الحروف الملتبسة", () => {
    for (const ch of "ILO01") expect(CODE_ALPHABET).not.toContain(ch);
  });

  it("ويُنظَّف ممّا يكتبه الزبون", () => {
    expect(normaliseCode(" abc-234 ")).toBe("ABC234");
    expect(normaliseCode("ABC234XXXX")).toHaveLength(6);
  });
});

describe("الصلاحية", () => {
  it("ثلاثون يوماً من اليوم", () => {
    expect(expiryFrom(30, new Date("2026-10-04T12:00:00Z"))).toBe("2026-11-03");
  });

  /** صفر أو سالب لا يصنع كوبوناً ميتاً في لحظة ميلاده */
  it("ولا تقلّ عن يوم", () => {
    expect(expiryFrom(0, new Date("2026-10-04T12:00:00Z"))).toBe("2026-10-05");
  });
});

describe("النصّ", () => {
  it("يصف كل نوع بالعربية", () => {
    expect(couponLabel({ kind: "amount", value: 5000 })).toContain("5,000");
    expect(couponLabel({ kind: "percent", value: 20 })).toContain("20٪");
    expect(couponLabel({ kind: "item", value: 0 }, "بركر دجاج")).toContain("بركر دجاج");
  });

  const msg = couponMessage({
    name: "أحمد",
    label: "خصم 5,000 د.ع",
    code: "ABC234",
    url: "https://stationiraq.com/coupon/ABC234",
    expiresOn: "2026-11-03",
    minOrder: 15000,
    uses: 3,
  });

  it("والرسالة تحمل الرمز والقيمة والشرط والمدّة", () => {
    expect(msg).toContain("ABC234");
    expect(msg).toContain("5,000");
    expect(msg).toContain("15,000");
    expect(msg).toContain("2026-11-03");
    expect(msg).toContain("3 مرّات");
  });

  it("وبلا اسمٍ تبدأ بتحيّة تامّة لا بفراغ", () => {
    expect(couponMessage({ label: "خصم", code: "A", url: "u" })).toContain("هلا بيك");
  });

  /** خطّ النظام (Tajawal) لا يحمل «گ» فيستعيره من خطٍّ آخر ويخرج غريباً */
  it("ولا حرف «گ» في شيءٍ يخرج من هنا", () => {
    expect(msg).not.toContain("گ");
    expect(couponLabel({ kind: "percent", value: 20 })).not.toContain("گ");
  });
});

describe("البوّابة", () => {
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");

  /** صفحة الكوبون للزبون — بلا هذا رأى شاشة دخول الموظفين (نفس فخّ البيجر) */
  it("‏/coupon مفتوح للزبون", () => {
    expect(proxy).toContain('"/coupon"');
  });

  /*
   * وشاشة الموظفين تبقى مقفلة. والمطابقة تشترط `/` بعد السابقة، فـ«/coupons»
   * لا يفتحها «/coupon» — واختبارٌ هنا لأن تغييراً في تلك المطابقة يفتح
   * قائمة كوبونات الزبائن للعالم بلا أن يرفع أحدٌ خطأً.
   */
  it("و‏/coupons للموظفين يبقى مقفلاً", () => {
    const isPublic = (p: string) =>
      ["/coupon"].some((x) => p === x || p.startsWith(`${x}/`));
    expect(isPublic("/coupon/ABC234")).toBe(true);
    expect(isPublic("/coupons")).toBe(false);
  });
});
