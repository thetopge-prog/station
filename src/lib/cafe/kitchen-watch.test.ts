import { describe, expect, it } from "vitest";
import { causes, falling, kitchenWatch, pctChange, rising, type CatState } from "./kitchen-watch";

describe("نسبة التغيّر", () => {
  it("تُحسب على الأسبوع السابق", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(80, 100)).toBe(-20);
    expect(pctChange(100, 100)).toBe(0);
  });

  /** من صفرٍ إلى عشرة ليس «لا نهاية» — ورقمٌ لا نهائي يكسر كل ترتيب بعده */
  it("وأساسٌ صفر لا يُقسَم عليه", () => {
    expect(pctChange(10, 0)).toBe(100);
    expect(pctChange(0, 0)).toBe(0);
    expect(Number.isFinite(pctChange(5, 0))).toBe(true);
  });
});

/**
 * جوهر الملفّ: قسمٌ نزل ٢٢٪ ومحلٌّ نزل ٢٠٪ — القسم لم يحدث له شيء.
 * ومن يقرأ الرقم المطلق يطارد سبباً لا وجود له.
 */
describe("نزول القسم ليس نزول القسم", () => {
  const cats = [
    { name: "زنجر", recent: 78, prior: 100 },   // −٢٢٪ والمحل −٢٠٪ ⇒ ثابت
    { name: "كنتاكي", recent: 100, prior: 100 }, // ٠٪ والمحل −٢٠٪ ⇒ صاعد فعلياً
    { name: "بيتزا", recent: 50, prior: 100 },   // −٥٠٪ ⇒ نازل حقيقي
  ];
  const rows = kitchenWatch(cats, -20);
  const by = (n: string) => rows.find((r) => r.name === n)!;

  it("القسم الذي تبع المحل يُقرأ ثابتاً", () => {
    expect(by("زنجر").changePct).toBe(-22);
    expect(by("زنجر").trend).toBe("ثابت");
    expect(by("زنجر").explainedByShop).toBe(true);
  });

  /** ثباتٌ ومحلٌّ ينزل = صعود. وهذا ما يضيع حين يُقرأ الرقم وحده */
  it("والذي ثبت بينما نزل المحل صاعدٌ في الحقيقة", () => {
    expect(by("كنتاكي").changePct).toBe(0);
    expect(by("كنتاكي").relativePct).toBe(20);
    expect(by("كنتاكي").trend).toBe("صاعد");
  });

  it("والذي نزل أكثر من المحل نازلٌ بحقّ", () => {
    expect(by("بيتزا").trend).toBe("نازل");
    expect(by("بيتزا").explainedByShop).toBe(false);
  });

  it("والترتيب من الأعلى صعوداً إلى الأدنى", () => {
    expect(rows[0].name).toBe("كنتاكي");
    expect(rows[rows.length - 1].name).toBe("بيتزا");
  });

  it("والتحرّك الصغير ضجيج لا خبر", () => {
    const [r] = kitchenWatch([{ name: "فرايز", recent: 105, prior: 100 }], 0);
    expect(r.trend).toBe("ثابت");
  });
});

describe("الصاعد والنازل", () => {
  const rows = kitchenWatch(
    [
      { name: "صوصات", recent: 150, prior: 100 },
      { name: "برجر", recent: 60, prior: 100 },
      { name: "فرايز", recent: 100, prior: 100 },
    ],
    0,
  );

  it("يُفرزان، والنازل أسوأه أولاً", () => {
    expect(rising(rows).map((r) => r.name)).toEqual(["صوصات"]);
    expect(falling(rows).map((r) => r.name)).toEqual(["برجر"]);
  });
});

describe("الأسباب — مرشَّحة لا مؤكَّدة", () => {
  const nazil: CatState = {
    name: "زنجر", recent: 50, prior: 100, changePct: -50, relativePct: -50,
    trend: "نازل", explainedByShop: false,
  };

  it("ارتفاع السعر يُذكر حين ينزل القسم", () => {
    const c = causes(nazil, [{ name: "كلاسيك زنجر", at: "09-29", from: 4500, to: 5000 }], 0);
    expect(c[0]).toContain("ارتفع سعر");
    expect(c[0]).toContain("4500");
  });

  /** سببٌ مخترع أسوأ من لا سبب: يُغلق البحث على الجواب الخطأ */
  it("وبلا شاهدٍ في البيانات يُقال ذلك صراحةً", () => {
    const c = causes(nazil, [], 0);
    expect(c[0]).toContain("لا سبب في البيانات");
  });

  it("وهدوء المحل يُقال أولاً ويُغني عن الباقي", () => {
    const c = causes({ ...nazil, trend: "ثابت", explainedByShop: true }, [{ name: "x", at: "09-29", from: 1, to: 2 }], -25);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain("نزول المحل");
  });

  it("وصنفٌ توقّف بيعه تماماً يُنبَّه عليه", () => {
    const c = causes({ ...nazil, recent: 0 }, [], 0);
    expect(c.some((x) => x.includes("ما زال مفعّلاً"))).toBe(true);
  });

  it("والصاعد بلا رفع سعر طلبٌ حقيقي", () => {
    const c = causes({ ...nazil, trend: "صاعد", relativePct: 40 }, [], 0);
    expect(c[0]).toContain("يستحقّ التوسّع");
  });
});
