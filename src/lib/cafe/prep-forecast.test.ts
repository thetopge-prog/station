import { describe, expect, it } from "vitest";
import {
  BANDS,
  forecastCategories,
  forecastDay,
  forecastTotal,
  hourBands,
  peakWindow,
  weekdayOf,
  type HourRow,
  type ItemDayRow,
} from "../../../supabase/functions/telegram-bot/prep-forecast";

/** أربعة أربعاءات وثلاثة خمائس — يكفي لتمييز المعدّلين */
const day = (d: string, name: string, qty: number, category = "كنتاكي"): ItemDayRow => ({
  day: d,
  name_ar: name,
  category_name: category,
  qty,
});

const WED = ["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23"];
const THU = ["2026-09-03", "2026-09-10", "2026-09-17"];

describe("weekdayOf", () => {
  it("يقرأ التاريخ تقويماً لا لحظة — فلا تزحزحه منطقة زمنية", () => {
    expect(weekdayOf("2026-09-23")).toBe(weekdayOf("2026-09-30"));
    expect(weekdayOf("2026-09-23")).not.toBe(weekdayOf("2026-09-24"));
  });
});

describe("فترات اليوم", () => {
  const hours: HourRow[] = [
    { hr: 13, category_name: "كنتاكي", qty: 10 },
    { hr: 19, category_name: "كنتاكي", qty: 40 },
    { hr: 22, category_name: "كنتاكي", qty: 30 },
    { hr: 1, category_name: "كنتاكي", qty: 20 },
  ];

  it("الفترات الأربع تغطّي اليوم كلّه بلا ساعةٍ مكرّرة", () => {
    const all = BANDS.flatMap((b) => b.hours);
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
  });

  it("الحصص تجمع واحداً", () => {
    const b = hourBands(hours, "كنتاكي");
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 6);
    expect(b[0].share).toBeCloseTo(0.1, 6);
    expect(b[1].share).toBeCloseTo(0.4, 6);
  });

  it("قسمٌ بلا بيانات يأخذ منحنى المحل بدل توزيعٍ متساوٍ كاذب", () => {
    const b = hourBands(hours, "قسمٌ لا وجود له");
    expect(b[1].share).toBeCloseTo(0.4, 6);
  });

  it("الذروة ثلاث ساعاتٍ متجاورة، وتلتفّ حول منتصف الليل", () => {
    expect(peakWindow(hours, "كنتاكي")).toContain("م");
    const late: HourRow[] = [
      { hr: 23, category_name: "ك", qty: 50 },
      { hr: 0, category_name: "ك", qty: 50 },
      { hr: 1, category_name: "ك", qty: 50 },
      { hr: 12, category_name: "ك", qty: 1 },
    ];
    expect(peakWindow(late, "ك")).toBe("11 م – 2 ص");
  });

  it("بلا ساعاتٍ إطلاقاً لا يخترع ذروة", () => {
    expect(peakWindow([], "ك")).toBe("—");
  });
});

describe("توقّع الصنف", () => {
  const hours: HourRow[] = [
    { hr: 13, category_name: "كنتاكي", qty: 20 },
    { hr: 19, category_name: "كنتاكي", qty: 80 },
  ];

  it("يمزج نفس اليوم بالمعدّل العامّ نصفاً بنصف", () => {
    const rows = [
      ...WED.map((d) => day(d, "كنتاكي ٣ قطع", 40)),
      ...THU.map((d) => day(d, "كنتاكي ٣ قطع", 20)),
    ];
    // أربعاء: معدّل اليوم المماثل ٤٠، والمعدّل العامّ (4×40+3×20)/7 = 31.43
    const [f] = forecastDay(rows, hours, "2026-09-30");
    expect(f.sameDayAvg).toBe(40);
    expect(f.recentAvg).toBeCloseTo(31.4, 1);
    expect(f.qty).toBe(36);
    expect(f.samples).toBe(4);
    expect(f.confidence).toBe("قوي");
  });

  it("وعيّنةٌ واحدة تُترك كلّها — نصفُ إشارةٍ منها ضجيج", () => {
    const rows = [day("2026-09-02", "ريزو", 100), ...THU.map((d) => day(d, "ريزو", 10))];
    // الثلاثاء غير موجود إطلاقاً، فيقع على المعدّل العامّ وحده
    const [f] = forecastDay(rows, hours, "2026-09-29");
    expect(f.samples).toBe(0);
    expect(f.confidence).toBe("تقديري");
    expect(f.qty).toBe(Math.round(f.recentAvg));
  });

  it("درجة الثقة تتبع عدد العيّنات لا حجم الرقم", () => {
    const two = [...WED.slice(0, 2).map((d) => day(d, "ستربس", 5))];
    expect(forecastDay(two, hours, "2026-09-30")[0].confidence).toBe("متوسّط");
  });

  /**
   * يومٌ أغلق فيه المحل ليس يوماً باع فيه صفراً. القسمة على طول المدى بدل
   * أيام البيع تخفض كل رقمٍ في اللوحة، فيُجهَّز أقلّ ممّا يُباع.
   */
  it("يقسم على أيام البيع لا على طول المدى", () => {
    const rows = [day("2026-09-02", "بيبسي", 30), day("2026-09-09", "بيبسي", 30)];
    const [f] = forecastDay(rows, hours, "2026-09-16");
    expect(f.recentAvg).toBe(30);
  });

  it("يوزّع الكمّية على الفترات ويرتّب الأصناف بالأكثر", () => {
    const rows = [
      ...WED.map((d) => day(d, "كنتاكي ٣ قطع", 40)),
      ...WED.map((d) => day(d, "ستربس", 8)),
    ];
    const out = forecastDay(rows, hours, "2026-09-30");
    expect(out.map((x) => x.name)).toEqual(["كنتاكي ٣ قطع", "ستربس"]);
    const top = out[0];
    expect(top.bands).toHaveLength(4);
    // ٢٠٪ قبل السادسة و٨٠٪ في ٦–٩ بحسب منحنى القسم
    expect(top.bands[0].qty).toBe(Math.round(top.qty * 0.2));
    expect(top.bands[1].qty).toBe(Math.round(top.qty * 0.8));
  });

  it("بلا بيانات لا لوحة — ولا صفر يُقدَّم على أنه توقّع", () => {
    expect(forecastDay([], hours, "2026-09-30")).toEqual([]);
  });
});

describe("مجموع الطلبات المتوقَّع", () => {
  it("يمزج كما يمزج الصنف، ويقول كم يوماً عرف", () => {
    const rows = [
      ...WED.map((d) => ({ day: d, orders: 120 })),
      ...THU.map((d) => ({ day: d, orders: 80 })),
    ];
    const t = forecastTotal(rows, "2026-09-30");
    expect(t.samples).toBe(4);
    expect(t.days).toBe(7);
    expect(t.orders).toBe(111); // 0.5×120 + 0.5×102.86
  });

  it("وبلا تاريخٍ يعيد أصفاراً لا تخميناً", () => {
    expect(forecastTotal([], "2026-09-30")).toEqual({ orders: 0, samples: 0, days: 0 });
  });
});

describe("التوقّع بالأقسام", () => {
  const hours: HourRow[] = [{ hr: 19, category_name: "كنتاكي", qty: 10 }];

  it("يجمع أصناف القسم في رقمٍ واحد", () => {
    const rows = [
      ...WED.map((d) => day(d, "كنتاكي ٣ قطع", 30, "كنتاكي")),
      ...WED.map((d) => day(d, "كنتاكي ٥ قطع", 10, "كنتاكي")),
    ];
    const [c] = forecastCategories(rows, hours, "2026-09-30");
    expect(c.name).toBe("كنتاكي");
    expect(c.qty).toBe(40);
  });

  it("ويُسقط ما لا قسم له — «—» ليس قسماً يُجهَّز له", () => {
    const rows = [...WED.map((d) => day(d, "صنف محذوف", 50, "—"))];
    expect(forecastCategories(rows, hours, "2026-09-30")).toEqual([]);
  });
});
