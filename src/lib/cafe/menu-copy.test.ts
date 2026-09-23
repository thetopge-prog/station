import { describe, expect, it } from "vitest";
import { fill, MENU_COPY } from "./menu-copy";

/**
 * شاشة الطلب هي آخر ما يراه الزبون قبل أن يدفع — نصٌّ ناقص فيها يعني سلّة
 * مهجورة لا شكوى. الأنواع تمسك المفاتيح، وهذا يمسك القيمة الفارغة والقالب
 * الذي نُسي فيه متغيّره.
 */
describe("MENU_COPY", () => {
  const langs = ["ar", "en"] as const;

  it("لا قيمة فارغة في أي لغة", () => {
    for (const l of langs) {
      for (const [k, v] of Object.entries(MENU_COPY[l])) {
        expect(v.trim(), `${l}.${k}`).not.toBe("");
      }
    }
  });

  it("القاموسان بنفس المفاتيح", () => {
    expect(Object.keys(MENU_COPY.en).sort()).toEqual(Object.keys(MENU_COPY.ar).sort());
  });

  it("الإنكليزية إنكليزية — لا حرف عربي تسرّب من النسخ", () => {
    for (const [k, v] of Object.entries(MENU_COPY.en)) {
      expect(/[؀-ۿ]/.test(v), `en.${k} = ${v}`).toBe(false);
    }
  });

  it("كل قالبٍ فيه متغيّر يحمله في اللغتين", () => {
    const vars = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const k of Object.keys(MENU_COPY.ar) as (keyof (typeof MENU_COPY)["ar"])[]) {
      expect(vars(MENU_COPY.en[k]), String(k)).toEqual(vars(MENU_COPY.ar[k]));
    }
  });
});

describe("fill", () => {
  it("يستبدل المتغيّر", () => {
    expect(fill("طاولتك رقم {table}", { table: 7 })).toBe("طاولتك رقم 7");
    expect(fill("⏳ {n} min", { n: 12 })).toBe("⏳ 12 min");
  });

  it("يترك ما لا يعرفه كما هو بدل أن يمحوه", () => {
    expect(fill("{a} و{b}", { a: "س" })).toBe("س و{b}");
  });
});
