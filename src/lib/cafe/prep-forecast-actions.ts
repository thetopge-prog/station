"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";
import { prepSheetDoc } from "./escpos";
import { buildDailyCountJob, buildStationDocJob } from "./printer-actions";
import { requireStaff } from "./auth";
import { businessDay, lastNDays } from "./time";
import { forecastCategories, forecastDay, forecastTotal, peakWindow, type HourRow, type ItemDayRow, type ItemForecast } from "../../../supabase/functions/telegram-bot/prep-forecast";

/**
 * لوحة «توجيه المطبخ الذكي» — تُقرأ في الكاشير وفي بوت الإدارة وعلى الورق.
 *
 * `requireStaff` لا `requireAdmin`: اللوحة كمّياتٌ وأوقات ولا دينار فيها،
 * والمطبخ هو من يحتاجها. وقاعدة المالك أن الكاشير لا يرى الأرباح — ولا يراها
 * هنا، لأن المال لا يدخل هذا الملفّ أصلاً.
 */

/** كم يوماً نقرأ إلى الوراء. أربعة أسابيع تعطي أربع عيّنات لكل يوم أسبوع */
const WINDOW_DAYS = 28;
/**
 * ما دون هذا في اليوم ضجيجٌ لا صنفٌ يُجهَّز له.
 *
 * ثلاثٌ لا واحدة: قِستُ الخطأ على أيامٍ حقيقية فكان بالأصناف كلّها ٣٥–٥٢٪،
 * وبأعلى عشرة ٢٦–٤٣٪. وصنفٌ يُباع ثلاث مرّات في الأسبوع لا يُجهَّز له سلفاً
 * أصلاً — فذكرُه يطيل الورقة ويُضعف الثقة بما فوقه.
 */
const MIN_PER_DAY = 3;
/** كم صنفاً يُعرض تحت الأقسام — الورقة تُقرأ واقفاً */
const TOP_ITEMS = 12;

export type PrepBoard = {
  day: string;
  /** عدد الطلبات المتوقَّع، وكم يوماً ومِن كم يومٍ مماثل بُني */
  orders: { orders: number; samples: number; days: number };
  /** الأقسام أولاً — خطؤها المقيس ١٩–٢٨٪، وهي ما يُبنى عليه التجهيز */
  categories: ItemForecast[];
  /** وأعلى الأصناف بعدها — خطؤها أكبر، فتُقرأ استئناساً */
  items: ItemForecast[];
  /** ذروة المحل كلّه — سطرٌ فوق اللوحة */
  peak: string;
};

async function rawRange(from: string, to: string) {
  const svc = createSupabaseServiceClient();
  const [items, hours, days] = await Promise.all([
    svc.rpc("sales_by_item_day", { p_from: from, p_to: to }),
    svc.rpc("sales_by_hour", { p_from: from, p_to: to }),
    svc.rpc("range_summary", { p_from: from, p_to: to }),
  ]);
  return {
    items: ((items.data ?? []) as ItemDayRow[]).map((r) => ({ ...r, day: String(r.day).slice(0, 10) })),
    hours: (hours.data ?? []) as HourRow[],
    days: ((days.data ?? []) as { day: string; orders_count: number }[])
      .filter((d) => d.orders_count > 0)
      .map((d) => ({ day: String(d.day).slice(0, 10), orders: d.orders_count })),
  };
}

/** اللوحة ليوم العمل الحالي — أو لأي يومٍ يُطلب */
export async function prepBoard(forDay = businessDay()): Promise<PrepBoard> {
  await requireStaff();
  // المدى ينتهي **أمس**: يوم اليوم ناقصٌ بطبيعته، وإدخاله يخفض معدّله
  const [from] = lastNDays(WINDOW_DAYS + 1);
  const yesterday = new Date(Date.parse(`${forDay}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const { items, hours, days } = await rawRange(from, yesterday);

  return {
    day: forDay,
    orders: forecastTotal(days, forDay),
    categories: forecastCategories(items, hours, forDay).filter((c) => c.qty >= MIN_PER_DAY),
    items: forecastDay(items, hours, forDay).filter((i) => i.qty >= MIN_PER_DAY).slice(0, TOP_ITEMS),
    peak: peakWindow(hours),
  };
}

/**
 * قياس دقّة التوقّع: يُبنى على ما قبل يومٍ مضى، ويُقارن بما بِيع فيه فعلاً.
 *
 * رقمٌ لم يُقَس لا يُقال. وهذه تُنادى مرّةً قبل تسليم اللوحة، وتُعاد كلّما
 * أراد المالك أن يعرف كم يصدّقها.
 */
export type Accuracy = { day: string; items: number; mape: number; ordersErr: number };

export async function backtest(day: string): Promise<Accuracy | null> {
  await requireStaff();
  const before = new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${day}T12:00:00Z`) - (WINDOW_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);

  const past = await rawRange(from, before);
  const actual = await rawRange(day, day);
  if (!past.items.length || !actual.items.length) return null;

  const predicted = new Map(forecastDay(past.items, past.hours, day).map((f) => [f.name, f.qty]));
  const real = new Map<string, number>();
  for (const r of actual.items) real.set(r.name_ar, (real.get(r.name_ar) ?? 0) + r.qty);

  // على الأصناف التي بيعت فعلاً، وبوزنٍ للكمّية: خطأ صنفٍ يُباع مرّةً في
  // الأسبوع لا يساوي خطأ الكنتاكي
  let err = 0;
  let tot = 0;
  let n = 0;
  for (const [name, q] of real) {
    if (q < MIN_PER_DAY) continue;
    err += Math.abs((predicted.get(name) ?? 0) - q);
    tot += q;
    n++;
  }
  const predOrders = forecastTotal(past.days, day).orders;
  const realOrders = actual.days[0]?.orders ?? 0;
  return {
    day,
    items: n,
    mape: tot ? Math.round((err / tot) * 100) : 0,
    ordersErr: realOrders ? Math.round(((predOrders - realOrders) / realOrders) * 100) : 0,
  };
}

/**
 * الورقة جاهزةً للطباعة — على الكاونتر أو في المطبخ.
 *
 * زرّان لا زرّ: المدير يطبعها عند الكاونتر ويقرؤها، والطبّاخ يريدها تخرج عنده.
 * والاختيار للموظّف لا لي.
 */
export async function buildPrepSheetPrint(target: "counter" | "kitchen") {
  const staff = await requireStaff();
  const b = await prepBoard();
  if (!b.categories.length) return { ok: false as const, error: "ما عدنا بيانات كافية للخطة — تحتاج أيام بيع أكثر." };

  const doc = prepSheetDoc({
    day: b.day,
    shopName: BRAND.nameAr,
    orders: b.orders.orders,
    samples: b.orders.samples,
    days: b.orders.days,
    peak: b.peak,
    categories: b.categories.map((c) => ({ name: c.name, qty: c.qty, peakHours: c.peakHours, bands: c.bands })),
    items: b.items.map((i) => ({ name: i.name, qty: i.qty, confidence: i.confidence })),
    by: staff.name,
  });

  const job = target === "kitchen" ? await buildStationDocJob(doc) : await buildDailyCountJob(doc);
  if (!job) {
    return {
      ok: false as const,
      error: target === "kitchen" ? "لا توجد طابعة مطبخ مفعّلة — اضبطها من صفحة الطابعات." : "لا توجد طابعة كاشير مفعّلة — اضبطها من صفحة الطابعات.",
    };
  }
  return { ok: true as const, job };
}
