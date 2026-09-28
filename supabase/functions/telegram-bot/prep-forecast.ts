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

/** المعدّل الأساسي من آخر هذه الأيام — الأقرب أدلّ على الغد */
export const RECENT_DAYS = 7;
/** وزن «نفس اليوم من الأسبوع»، ويكبر بعدد عيّناته حتى نصفٍ لا أكثر */
export const sameDayWeight = (samples: number): number => Math.min(samples, 4) / 8;

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
 * `المتوقَّع = و × معدّل نفس اليوم من الأسبوع + (١−و) × معدّل آخر سبعة أيام`
 *
 * **والوزن `و` يكبر بعدد العيّنات**: `أصغر(العيّنات، ٤) ÷ ٨`. فعيّنتان تزنان
 * الربع، وأربعٌ تزن النصف — وهو أقصاه. والسبب أن نفس اليوم من الأسبوع يحمل
 * إشارةً حقيقية (الجمعة ليست كالثلاثاء)، لكنها إشارةٌ لا تُصدَّق إلا بقدر ما
 * تحتها من أيام. وكان الوزن نصفاً ثابتاً، فجمعةٌ واحدة شاذّة تكفي لتحرّك
 * الرقم كلّه — وهو ما وقع فعلاً يوم ٢٥ أيلول.
 *
 * **والمعدّل من آخر سبعة أيام لا من المدى كلّه.** المبيعات تتحرّك: كانت
 * ١٢٠ طلباً في اليوم أول الشهر و٩٠ في آخره، فمعدّل خمسة عشر يوماً يتوقّع
 * لليوم ما باعه المحل قبل أسبوعين. والأسبوع الأخير أقرب إلى الغد.
 *
 * وكِلا التغييرين مقيسان لا مُفترَضان: على آخر سبعة أيام نزل الخطأ من ٢٨٪
 * إلى ٢٤٪ بالأقسام، وعلى الجمعة وحدها من ٣٤٪ إلى ٢١٪.
 *
 * والقسمة على **أيام البيع الفعلية** لا على طول المدى: يومٌ أغلق فيه المحل
 * ليس يوماً باع فيه صفراً، وقسمةٌ عليه تخفض كل رقمٍ في اللوحة.
 */
export function forecastDay(rows: ItemDayRow[], hours: HourRow[], forDay: string): ItemForecast[] {
  const tradedDays = [...new Set(rows.map((r) => r.day))].sort();
  if (!tradedDays.length) return [];

  const wd = weekdayOf(forDay);
  // العيّنات المماثلة من المدى كلّه، والمعدّل الأساسي من آخر أسبوع وحده
  const sameDays = tradedDays.filter((d) => weekdayOf(d) === wd);
  const recentDays = tradedDays.slice(-RECENT_DAYS);
  const dayCount = recentDays.length;

  const byItem = new Map<string, { category: string; perDay: Map<string, number> }>();
  for (const r of rows) {
    const e = byItem.get(r.name_ar) ?? { category: r.category_name, perDay: new Map() };
    e.perDay.set(r.day, (e.perDay.get(r.day) ?? 0) + r.qty);
    byItem.set(r.name_ar, e);
  }

  const out: ItemForecast[] = [];
  for (const [name, e] of byItem) {
    const recentAvg = recentDays.reduce((s, d) => s + (e.perDay.get(d) ?? 0), 0) / dayCount;
    const sameSum = sameDays.reduce((s, d) => s + (e.perDay.get(d) ?? 0), 0);
    const samples = sameDays.length;
    const sameDayAvg = samples ? sameSum / samples : 0;
    const w = sameDayWeight(samples);
    const qty = w * sameDayAvg + (1 - w) * recentAvg;

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
  const recent = [...days.keys()].sort().slice(-RECENT_DAYS);
  const recentAvg = recent.reduce((s, d) => s + (days.get(d) ?? 0), 0) / recent.length;
  const sameAvg = same.length ? same.reduce((s, [, q]) => s + q, 0) / same.length : 0;
  const w = sameDayWeight(same.length);
  return { orders: Math.round(w * sameAvg + (1 - w) * recentAvg), samples: same.length, days: n };
}

/*
 * ══ نتائج الخطة: ما وعدنا به مقابل ما صار ══════════════════════════════
 *
 * توقّعٌ لا يُقاس بعد وقوعه دعوى. وهذه تُنادى الثالثة فجراً على اليوم الذي
 * انتهى للتوّ، فيقرأ المالك صباحاً كم صدقت خطة أمس قبل أن يبني عليها.
 *
 * والحدّان من المالك، وهما غير متماثلين عن عمد:
 *
 *   **نقصٌ فوق ٣٠٪** — جهّزنا أكثر ممّا بِيع. والثمن طعامٌ يُرمى أو يبيت،
 *   وهو خسارةٌ مباشرة، لكنها خسارةٌ محسوبة يتحمّلها المحل.
 *
 *   **زيادةٌ فوق ٢٠٪** — بِيع أكثر ممّا جهّزنا. والثمن زبونٌ انتظر أو سمع
 *   «خلص»، وهو أغلى: لا يظهر في جردٍ ولا يعود ليشتكي. ولهذا حدُّه أضيق.
 */

/** ما دون هذا نقصاً لا يُنبَّه عليه — تجهيزٌ زائد ضمن المعقول */
const DEFICIT = 0.30;
/** وما دون هذا زيادةً — والحدّ أضيق لأن ثمن النفاد أعلى من ثمن الفائض */
const SURPLUS = 0.20;

export type PlanVerdict = "نقص" | "زيادة" | "مطابق";

export type PlanResult = {
  name: string;
  forecast: number;
  actual: number;
  /** فعلي − متوقَّع: سالبٌ يعني جهّزنا زيادة */
  diff: number;
  /** نسبة الانحراف عن المتوقَّع، موجبةٌ دائماً */
  pct: number;
  verdict: PlanVerdict;
};

/**
 * يقارن سطراً سطراً ويحكم على كلٍّ بحدّه.
 *
 * والمتوقَّع صفراً يُترك: القسمة عليه لا معنى لها، و«توقّعنا صفراً فبِيع
 * ثلاثة» ليس خطأ تجهيز — هو صنفٌ لم يدخل اللوحة أصلاً، ويُعرَض وحده.
 */
export function comparePlan(rows: { name: string; forecast: number; actual: number }[]): PlanResult[] {
  const out: PlanResult[] = [];
  for (const r of rows) {
    if (r.forecast <= 0) continue;
    const diff = r.actual - r.forecast;
    const pct = Math.abs(diff) / r.forecast;
    const verdict: PlanVerdict =
      diff < 0 && pct > DEFICIT ? "نقص" : diff > 0 && pct > SURPLUS ? "زيادة" : "مطابق";
    out.push({ name: r.name, forecast: r.forecast, actual: r.actual, diff, pct: Math.round(pct * 100), verdict });
  }
  // الأبعد عن الخطّة أولاً: من يقرأ سطرين يقرأ أهمّهما
  return out.sort((a, b) => b.pct - a.pct);
}

/** متوسّط الانحراف — رقمٌ واحد يقول كم كانت الخطّة قريبة */
export function planError(rows: PlanResult[]): number {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length);
}

/**
 * نسبة المطابقة — الوجه الآخر للانحراف.
 *
 * «انحراف ١٣٪» و«مطابقة ٨٧٪» رقمٌ واحد بقراءتين. والثانية هي الصحيحة عملياً:
 * التوقّع أصاب معظم اليوم، والباقي مساحة تحسّن لا فشل. ومن يقرأ «خطأ» كل
 * صباح يكفّ عن القراءة.
 */
export const accuracy = (forecast: number, actual: number): number =>
  forecast <= 0 ? 0 : Math.max(0, 100 - Math.round((Math.abs(actual - forecast) / forecast) * 100));

/** متوسّط المطابقة على أسطر عدّة */
export function planAccuracy(rows: PlanResult[]): number {
  if (!rows.length) return 0;
  return Math.max(0, 100 - planError(rows));
}

/**
 * أي صنفٍ بالضبط حرّك قسمه.
 *
 * «الصوصات ارتفعت ٣١٪» خبرٌ لا يُعمَل به: المطبخ لا يجهّز «صوصات»، يجهّز صوصاً
 * بعينه. فحين يتحرّك قسمٌ تُفتَح أصنافه ويُقال أيّها تحرّك.
 *
 * وتدخل الأصناف التي لم يتوقّعها أحد (توقّع صفر وبِيع خمسة): هي أصدق إشارةٍ
 * على طلبٍ جديد، وهي أوّل ما تسقطه المقارنة النسبية.
 */
export function movers(
  rows: { name: string; forecast: number; actual: number }[],
  dir: "up" | "down",
  limit = 3,
  minDiff = 2,
): { name: string; forecast: number; actual: number; diff: number }[] {
  return rows
    .map((r) => ({ ...r, diff: r.actual - r.forecast }))
    .filter((r) => (dir === "up" ? r.diff >= minDiff : r.diff <= -minDiff))
    .sort((a, b) => (dir === "up" ? b.diff - a.diff : a.diff - b.diff))
    .slice(0, limit);
}

/*
 * ══ خطة الرواتب ═══════════════════════════════════════════════════════
 *
 * رواتب العراق تُصرف تدريجياً في أواخر الشهر، فيرتفع الطلب. والنظام لم يعش
 * نهاية شهرٍ بعد، فلا معامل مقيساً لدينا.
 *
 * فاعتمدنا ما طلبه المالك: **أعلى قفزةٍ حدثت بين يومين متتاليين في بياناتنا**.
 * والقفزة الأعلى ظاهرياً كانت ٩ → ١٠ أيلول (‎77 → 130‎ = ‎+69٪‎)، **وأسقطناها**:
 * يوم ٩ أيلول أول أيام النظام وأوّل طلبٍ فيه الساعة ١١:٠٤، فساعات الليل
 * الأولى — وهي ثلث اليوم — ليست فيه. فالقفزة تشغيلٌ لا طلب.
 *
 * والأعلى الحقيقية: **١٩ → ٢٠ أيلول، ‎77 → 114‎ = ‎+48٪‎**، ويوماهما كاملان.
 *
 * وهذا سقفٌ لا تنبّؤ: أقصى ما رأيناه المحل يقفزه في ليلة. والخطة الراتبية
 * تُقرأ بجانب العادية لا بدلاً منها — بينهما يقف المالك ويقرّر.
 *
 * ويُستبدل الرقم بالمقيس أول نهاية شهرٍ يسجّلها النظام.
 */

/** أعلى قفزةٍ مقيسة بين يومين متتاليين (١٩→٢٠ أيلول ٢٠٢٦) */
export const SALARY_LIFT = 1.48;

/** كم يوماً في آخر الشهر تُرافق الخطةَ العاديةَ خطةٌ راتبية */
export const SALARY_DAYS = 5;
/** وكم يوماً في أوّل الشهر التالي — الصرف يتدرّج ولا يقف عند رأس الشهر */
export const SALARY_DAYS_AFTER = 5;

/**
 * هل هذا اليوم في نافذة الرواتب.
 *
 * النافذة **تعبر رأس الشهر**: خمسة أيامٍ قبله وخمسةٌ بعده. والصرف في العراق
 * تدريجيّ — يبدأ أواخر الشهر ويمتدّ إلى أيامه الأولى — فنافذةٌ تقف عند الثلاثين
 * تترك أوّل أيام الصرف بلا خطة، وهي من أقواها.
 *
 * وطول الشهر يُقرأ من الشهر نفسه لا برقمٍ ثابت: شباط ٢٨ وأيلول ٣٠ وتشرين ٣١،
 * و«يوم ٢٦» ليس آخر الشهر في كلٍّ منها.
 */
export function isSalaryWindow(day: string, lastDays = SALARY_DAYS, firstDays = SALARY_DAYS_AFTER): boolean {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return false;
  if (d <= firstDays) return true;
  // اليوم صفر من الشهر التالي = آخر يومٍ في هذا الشهر
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > inMonth - lastDays;
}

/** ترفع كمّيات الخطة بمعاملٍ واحد — الأقسام وفتراتها معاً، فلا يتناقض مجموعٌ مع تفصيله */
export function scalePlan(rows: ItemForecast[], lift = SALARY_LIFT): ItemForecast[] {
  return rows.map((r) => ({
    ...r,
    qty: Math.round(r.qty * lift),
    bands: r.bands.map((b) => ({ ...b, qty: Math.round(b.qty * lift) })),
  }));
}
