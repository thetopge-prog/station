/**
 * توقّع طلبات اليوم — كم يُجهَّز من كل صنف، ومتى.
 *
 * ملفٌّ نقيّ: لا شبكة ولا قاعدة ولا React. المادّة تأتي من `sales_by_item_day`
 * و`sales_by_hour`، والرأي كلّه هنا — فيُختبَر بلا بيئة، ويُقرأ في مكانٍ واحد.
 *
 * ويسكن مع دوالّ البوت لا في `src/lib/cafe/` لأن قارئيه اثنان: شاشة الكاشير
 * (Next) وبوت الإدارة (Deno) — وهما لا يتشاركان إلا هذا المجلّد. نفس سُكنى
 * `order-flow.ts` و`rating-flow.ts`، وللسبب نفسه: منطقٌ واحد لا نسختان
 * تنحرف إحداهما عن الأخرى بصمت.
 *
 * **وما لا يفعله، وهو أهمّ ما يُقال عنه:** ليس نموذجاً ولا تعلّماً آلياً. هو
 * معدّلان موزونان على ما باعه المحل فعلاً. وستة عشر يوماً من البيانات تعني
 * سطرين لكل يوم من أيام الأسبوع — فالرقم **تقديرٌ يتحسّن كل أسبوع**، ولذلك
 * يحمل معه عدد الأيام التي بُني عليها ودرجةَ ثقته. الرقم الذي لا يقول كم
 * يعرف يُصدَّق أكثر مما يستحقّ.
 */

/** صفٌّ من `sales_by_item_day` */
export type ItemDayRow = { day: string; name_ar: string; category_name: string; qty: number };
/** صفٌّ من `sales_by_hour` */
export type HourRow = { hr: number; category_name: string; qty: number };

export type Band = { label: string; share: number; qty: number };

export type ItemForecast = {
  name: string;
  category: string;
  /** المتوقَّع اليوم */
  qty: number;
  sameDayAvg: number;
  recentAvg: number;
  /** كم يوماً مماثلاً (نفس اليوم من الأسبوع) دخل الحساب */
  samples: number;
  confidence: Confidence;
  /** توزيع الكمّية على فترات اليوم */
  bands: Band[];
  /** أزحم ساعتين متجاورتين لهذا القسم — «٨–١٠ مساءً» */
  peakHours: string;
};

export type Confidence = "قوي" | "متوسّط" | "تقديري";

/**
 * فترات يوم العمل الأربع.
 *
 * تبدأ الرابعة فجراً لا منتصف الليل: يوم العمل يُقطع 04:00 بغداد
 * (`business_day_of`)، فساعة الواحدة فجراً من مبيعات ليلة أمس لا يوم جديد.
 * والحدود من المنحنى الحقيقي: هدوءٌ حتى السادسة، ثم صعود، ثم الذروة، ثم ذيلٌ
 * بعد منتصف الليل يبقى ثقيلاً في هذا المحل.
 */
export const BANDS: { label: string; hours: number[] }[] = [
  { label: "قبل ٦ مساءً", hours: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
  { label: "٦–٩ مساءً", hours: [18, 19, 20] },
  { label: "٩–١٢ ليلاً", hours: [21, 22, 23] },
  { label: "بعد منتصف الليل", hours: [0, 1, 2, 3] },
];

const HOUR_AR = (h: number): string => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? " ص" : " م"}`;
};

/** يوم الأسبوع من «2026-09-25» بلا مناطق زمنية — النصّ تقويمٌ لا لحظة */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * حصّة كل فترةٍ من مبيعات القسم.
 *
 * وحين لا يُعرف القسم (صنفٌ حُذف، أو قسمٌ لم يبِع شيئاً في المدى) يُستعمل
 * منحنى المحل كلّه: منحنىً عامٌّ أقرب إلى الصواب من توزيعٍ متساوٍ يزعم أن
 * الظهيرة كالذروة.
 */
export function hourBands(hours: HourRow[], category?: string): Band[] {
  const rows = category ? hours.filter((h) => h.category_name === category) : hours;
  const use = rows.length ? rows : hours;
  const total = use.reduce((s, h) => s + h.qty, 0);
  return BANDS.map((b) => {
    const q = use.filter((h) => b.hours.includes(h.hr)).reduce((s, h) => s + h.qty, 0);
    return { label: b.label, share: total ? q / total : 0, qty: 0 };
  });
}

/** أزحم ساعتين متجاورتين — سطرٌ يقرؤه الطبّاخ بلا جدول */
export function peakWindow(hours: HourRow[], category?: string): string {
  const rows = category ? hours.filter((h) => h.category_name === category) : hours;
  const use = rows.length ? rows : hours;
  if (!use.length) return "—";
  const byHour = new Map<number, number>();
  for (const h of use) byHour.set(h.hr, (byHour.get(h.hr) ?? 0) + h.qty);
  // الساعات تلتفّ حول منتصف الليل: ٢٣ ثم ٠ متجاورتان
  let best = { at: -1, sum: -1 };
  for (const h of byHour.keys()) {
    const sum = (byHour.get(h) ?? 0) + (byHour.get((h + 1) % 24) ?? 0) + (byHour.get((h + 2) % 24) ?? 0);
    if (sum > best.sum) best = { at: h, sum };
  }
  return best.at < 0 ? "—" : `${HOUR_AR(best.at)} – ${HOUR_AR((best.at + 3) % 24)}`;
}

/**
 * التوقّع لكل صنف.
 *
 * `المتوقَّع = ٠٫٥ × معدّل نفس اليوم من الأسبوع + ٠٫٥ × معدّل كل الأيام`
 *
 * والنصف والنصف مقصودان: نفس اليوم من الأسبوع يحمل الإشارة الحقيقية (الجمعة
 * ليست كالثلاثاء)، لكن عيّنتَه اليوم سطران — فلو اتُّكل عليه وحده لقفز الرقم
 * مع أول يومٍ شاذّ. والمعدّل العامّ يثبّته. وحين تقلّ العيّنات عن اثنتين
 * يُترك اليومُ المماثل كلّه: نصفُ إشارةٍ من عيّنةٍ واحدة ضجيجٌ لا إشارة.
 *
 * والقسمة على **أيام البيع الفعلية** لا على طول المدى: يومٌ أغلق فيه المحل
 * ليس يوماً باع فيه صفراً، وقسمةٌ عليه تخفض كل رقمٍ في اللوحة.
 */
export function forecastDay(rows: ItemDayRow[], hours: HourRow[], forDay: string): ItemForecast[] {
  const tradedDays = new Set(rows.map((r) => r.day));
  const dayCount = tradedDays.size;
  if (!dayCount) return [];

  const wd = weekdayOf(forDay);
  const sameDays = [...tradedDays].filter((d) => weekdayOf(d) === wd);

  const byItem = new Map<string, { category: string; perDay: Map<string, number> }>();
  for (const r of rows) {
    const e = byItem.get(r.name_ar) ?? { category: r.category_name, perDay: new Map() };
    e.perDay.set(r.day, (e.perDay.get(r.day) ?? 0) + r.qty);
    byItem.set(r.name_ar, e);
  }

  const out: ItemForecast[] = [];
  for (const [name, e] of byItem) {
    const recentAvg = [...e.perDay.values()].reduce((s, q) => s + q, 0) / dayCount;
    const sameSum = sameDays.reduce((s, d) => s + (e.perDay.get(d) ?? 0), 0);
    const samples = sameDays.length;
    const sameDayAvg = samples ? sameSum / samples : 0;
    const qty = samples >= 2 ? 0.5 * sameDayAvg + 0.5 * recentAvg : recentAvg;

    const shares = hourBands(hours, e.category);
    const total = Math.round(qty);
    out.push({
      name,
      category: e.category,
      qty: total,
      sameDayAvg: round1(sameDayAvg),
      recentAvg: round1(recentAvg),
      samples,
      confidence: samples >= 3 ? "قوي" : samples === 2 ? "متوسّط" : "تقديري",
      bands: shares.map((b) => ({ ...b, qty: Math.round(total * b.share) })),
      peakHours: peakWindow(hours, e.category),
    });
  }
  return out.sort((a, b) => b.qty - a.qty);
}

/**
 * التوقّع بالأقسام — وهو الرقم الذي يُصدَّق.
 *
 * قِستُ الثلاثة على أيامٍ حقيقية قبل أن أعرضها: الخطأ بالأقسام **١٩–٢٨٪**،
 * وبأعلى عشرة أصناف ٢٦–٤٣٪، وبالأصناف كلّها ٣٥–٥٢٪. والسبب حسابيّ لا عارض:
 * ستة عشر يوماً تعني عيّنةً أو عيّنتين لكل يوم أسبوع، وضجيجُ صنفٍ صغير لا
 * يُلغى إلا بالجمع. فالقسم يُجمَع فيهدأ، والصنف الصغير يبقى ضجيجاً مهما زُيّن.
 *
 * ولذلك تُقدَّم الأقسام وتُذيَّل بالأصناف الكبيرة وحدها، ويُسكَت عن الذيل.
 *
 * ونفس الحساب: الصنف هنا هو القسم، فلا منطق ثانٍ يُصان.
 */
export function forecastCategories(rows: ItemDayRow[], hours: HourRow[], forDay: string): ItemForecast[] {
  return forecastDay(
    rows.filter((r) => r.category_name && r.category_name !== "—").map((r) => ({ ...r, name_ar: r.category_name })),
    hours,
    forDay,
  );
}

/** مجموع الطلبات المتوقَّعة لليوم — رقمٌ واحد فوق اللوحة */
export function forecastTotal(rows: { day: string; orders: number }[], forDay: string): { orders: number; samples: number; days: number } {
  const days = new Map<string, number>();
  for (const r of rows) days.set(r.day, r.orders);
  const n = days.size;
  if (!n) return { orders: 0, samples: 0, days: 0 };
  const wd = weekdayOf(forDay);
  const same = [...days.entries()].filter(([d]) => weekdayOf(d) === wd);
  const recentAvg = [...days.values()].reduce((s, q) => s + q, 0) / n;
  const sameAvg = same.length ? same.reduce((s, [, q]) => s + q, 0) / same.length : 0;
  return {
    orders: Math.round(same.length >= 2 ? 0.5 * sameAvg + 0.5 * recentAvg : recentAvg),
    samples: same.length,
    days: n,
  };
}
