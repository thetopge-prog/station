import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * البيجر — ما يجب ألّا ينكسر.
 *
 * منطق الاشتراك كلّه في القاعدة (`pager_subscribe`، الترحيل 0115) لأنه حراسة
 * لا حساب، ولا يُختبر هنا بلا قاعدة. أما ما يُختبر فهو ما يقرؤه إنسانٌ لاحقاً
 * ويظنّه تفصيلاً فيحذفه — وهذه الاختبارات تقف في وجهه.
 */

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("تنبيه الموظفين لا يصل هاتف الزبون", () => {
  /*
   * الخطأ الذي يكسر شيئاً قائماً.
   *
   * `push_subscriptions` صار يحمل أجهزة زبائن (`order_id` مملوء). وإرسال
   * «طلب جديد» للموظفين كان يبعث لكل صفٍّ بلا شرط — فبلا الترشيح يرنّ هاتف
   * الزبون بكل طلبٍ يدخل المحل، وهو ما لا يُكتشف إلا من شكوى زبون.
   */
  const push = read("./push.ts");

  it("sendNewOrderPush يُرشِّح أجهزة الموظفين وحدها", () => {
    const fn = push.slice(push.indexOf("export async function sendNewOrderPush"));
    expect(fn).toContain('.is("order_id", null)');
  });

  it("وأجهزة البيجر تُقرأ بالطلب لا بالكلّ", () => {
    const notify = read("./customer-notify.ts");
    expect(notify).toContain('.eq("order_id", orderId)');
  });

  /** البيجر لمرّة واحدة: بلا الحذف يتراكم صفٌّ لكل زبونٍ مسح رمزاً */
  it("ويُحذف الصفّ بعد أن ينتهي دور الطلب", () => {
    const notify = read("./customer-notify.ts");
    expect(notify).toContain('.delete().eq("order_id", orderId)');
  });
});

describe("رمز الإيصال", () => {
  const routing = read("./print-routing.ts");

  /** ثلاثة أحرف تُعاد كل يوم = يُخمَّن. والصفحة تفتح اشتراك إشعارات */
  it("يحمل المعرّف لا رمز الاستلام", () => {
    expect(routing).toContain("`${trackUrl}/${order.orderId}`");
    expect(routing).not.toContain("${trackUrl}/${order.orderNumber}");
  });

  /** وتذكرة التجهيز يمسحها الموظّف — لو تغيّرت لتعطّل «تم التجهيز» بالمسح */
  it("ورمز تذكرة التجهيز باقٍ «الرقم-الرمز»", () => {
    expect(routing).toContain("`${order.orderNumber}-${order.pickupCode}`");
  });
});

describe("مسار البيجر عامّ", () => {
  it("‏/t مفتوح في البوّابة — وإلّا رأى الزبون شاشة دخول الموظفين", () => {
    expect(read("../../proxy.ts")).toContain('"/t"');
  });
});
