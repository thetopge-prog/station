import { describe, expect, it } from "vitest";
import { linesOf, parseExternalOrder, refOf, sourceOf, totalOf } from "./external-order";

/**
 * إشعار «طلب جديد» من تطبيق شركة توصيل. الشكل الحقيقي لإشعار توترز لم يُرَ
 * بعد؛ هذه الأشكال التي يُحتمل أن يأتي بها، والقاعدة: الشكّ يميل إلى «تنبيه
 * بلا أصناف» لا إلى صنف مخترع.
 */
describe("sourceOf", () => {
  it("names the company from the package", () => {
    expect(sourceOf("com.toters.totersmerchant")).toBe("toters");
    expect(sourceOf("iq.talabaty.merchant")).toBe("talabaty");
    expect(sourceOf("com.whatsapp")).toBe("other");
  });
});

describe("refOf", () => {
  it("reads the order number in every spelling", () => {
    expect(refOf("طلب جديد #890")).toBe("890");
    expect(refOf("New order 84512")).toBe("84512");
    expect(refOf("رقم الطلب: ٨٩٠")).toBe("890");
    expect(refOf("Order #12")).toBe("12");
  });
  it("does not take a phone number or a price for a reference", () => {
    expect(refOf("اتصل 07701234567")).toBeNull();
    expect(refOf("المجموع 10,000")).toBeNull();
  });
});

describe("linesOf", () => {
  it("reads «2 × name», «name ×2», and «name (2)»", () => {
    expect(linesOf("2 × بيتزا سوبريم\nسموك زنجر ×1\nالويدجز (3)")).toEqual([
      { name: "بيتزا سوبريم", qty: 2 },
      { name: "سموك زنجر", qty: 1 },
      { name: "الويدجز", qty: 3 },
    ]);
  });
  it("ignores lines with no quantity, prices, and totals", () => {
    expect(linesOf("حي الضباط قرب الجامع\n2 x 5,000\nالمجموع ×1\nريزو ×1")).toEqual([{ name: "ريزو", qty: 1 }]);
  });
  it("splits on the separators a one-line notification uses", () => {
    expect(linesOf("ريزو ×1 · سموك زنجر ×1")).toHaveLength(2);
  });
});

describe("totalOf", () => {
  it("reads the total when present", () => {
    expect(totalOf("المجموع: 10,000")).toBe(10000);
    expect(totalOf("Total 25.500")).toBe(25500);
    expect(totalOf("لا شيء هنا")).toBeNull();
  });
});

describe("parseExternalOrder", () => {
  it("assembles source, ref, lines and total", () => {
    const p = parseExternalOrder({ pkg: "com.toters.totersmerchant", title: "طلب جديد #890", text: "ريزو ×1\nسموك زنجر ×1\nالمجموع: 10,000" });
    expect(p).toEqual({ source: "toters", ref: "890", lines: [{ name: "ريزو", qty: 1 }, { name: "سموك زنجر", qty: 1 }], total: 10000 });
  });
  it("is an alert with no lines when the notification only says an order arrived", () => {
    const p = parseExternalOrder({ pkg: "com.toters.totersmerchant", title: "Toters", text: "لديك طلب جديد" });
    expect(p.lines).toEqual([]);
    expect(p.ref).toBeNull();
  });
});
