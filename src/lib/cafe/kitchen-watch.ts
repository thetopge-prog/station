/**
 * مراقبة المطبخ — حالةُ كل قسم، ولماذا تحرّك.
 *
 * الخطة اليومية تقارن يوماً بيوم، فقسمٌ ينزل خمسة عشر بالمئة كل يوم لأسبوع لا
 * يُنبَّه عليه أبداً: كلّ يومٍ وحده داخل الحدّ، والمجموع انهيار. وهذا الملفّ
 * يقارن **أسبوعاً بأسبوع** فيرى ما لا يُرى في يوم.
 *
 * ══ والفكرة كلّها في سطرٍ واحد ══
 *
 * **نزولُ القسم لا يعني أن القسم نزل.**
 *
 * لو نزل المحل كلّه عشرين بالمئة ونزل الزنجر اثنين وعشرين، فالزنجر لم يحدث له
 * شيء — الزبائن قلّوا. ومن يقرأ الرقم المطلق يطارد سبباً لا وجود له، ويغيّر
 * وصفةً لا عيب فيها.
 *
 * فيُقاس تحرّك القسم **منسوباً إلى تحرّك المحل**: كم تحرّك بعد طرح ما تحرّكه
 * الجميع. وهذا وحده يفرّق بين «قسمٌ يمرض» و«محلٌّ هادئ».
 *
 * نقيّ بلا شبكة ولا قاعدة — يُختبر كما تُختبر `prep-forecast.ts`.
 */

/** ما دون هذا ضجيجٌ لا تحرّك — أسبوعان لا يتطابقان أبداً */
const MOVE = 10;

export type Trend = "صاعد" | "نازل" | "ثابت";

export type CatWindow = { name: string; recent: number; prior: number };

export type CatState = {
  name: string;
  recent: number;
  prior: number;
  /** تغيّره الخام بالمئة */
  changePct: number;
  /** تغيّره بعد طرح تحرّك المحل — هذا هو الحكم */
  relativePct: number;
  trend: Trend;
  /** هل يفسّره تحرّك المحل كلّه؟ فلا ذنب للقسم */
  explainedByShop: boolean;
};

/** نسبة التغيّر. وأساسٌ صفرٌ لا يُقسَم عليه: من صفرٍ إلى عشرة ليس «لا نهاية» */
export function pctChange(recent: number, prior: number): number {
  if (prior <= 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prior) / prior) * 100);
}

/**
 * حالة كل قسم، منسوبةً إلى حركة المحل.
 *
 * `shopPct` تحرّك المحل كلّه بين الأسبوعين — يُحسب من الطلبات لا من القطع،
 * لأن القطع تتأثّر بحجم السلّة والطلبات لا تتأثّر.
 */
export function kitchenWatch(cats: CatWindow[], shopPct: number): CatState[] {
  return cats
    .map((c) => {
      const changePct = pctChange(c.recent, c.prior);
      const relativePct = changePct - shopPct;
      const trend: Trend = relativePct >= MOVE ? "صاعد" : relativePct <= -MOVE ? "نازل" : "ثابت";
      return {
        name: c.name,
        recent: c.recent,
        prior: c.prior,
        changePct,
        relativePct,
        trend,
        // نزل نزولاً حقيقياً، لكن نزول المحل يفسّره: لا سبب يُبحث عنه في القسم
        explainedByShop: changePct <= -MOVE && trend === "ثابت",
      };
    })
    .sort((a, b) => b.relativePct - a.relativePct);
}

/** الأعلى صعوداً — القسم الذي يستحقّ الاهتمام والتوسّع */
export const rising = (rows: CatState[]): CatState[] => rows.filter((r) => r.trend === "صاعد");

/** والأعلى نزولاً — بعد استبعاد ما يفسّره هدوء المحل */
export const falling = (rows: CatState[]): CatState[] =>
  rows.filter((r) => r.trend === "نازل").sort((a, b) => a.relativePct - b.relativePct);

export type PriceEvent = { name: string; at: string; from: number; to: number };

/**
 * الأسباب المرشَّحة — **مرشَّحة لا مؤكَّدة**.
 *
 * النظام لا يعرف أن الطبّاخ تغيّر ولا أن المنافس فتح. فما يُعرض هنا هو ما
 * تشهد به البيانات وحده، ويُقال بصيغة الاحتمال لا الحكم — لأن سبباً مخترعاً
 * أسوأ من لا سبب: يُغلق البحث على الجواب الخطأ.
 */
export function causes(row: CatState, priceEvents: PriceEvent[], shopPct: number): string[] {
  const out: string[] = [];

  if (row.explainedByShop) {
    out.push(`نزول المحل كلّه ${Math.abs(shopPct)}٪ يفسّره — القسم نفسه لم يتحرّك`);
    return out;
  }

  const ups = priceEvents.filter((p) => p.to > p.from);
  if (row.trend === "نازل" && ups.length) {
    const worst = ups.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
    out.push(`ارتفع سعر «${worst.name}» من ${worst.from} إلى ${worst.to} يوم ${worst.at}`);
  }

  if (row.trend === "نازل" && row.prior > 0 && row.recent === 0) {
    out.push("لم يُبَع منه شيء هذا الأسبوع — تأكّد أنه ما زال مفعّلاً وأن المطبخ يحضّره");
  }

  if (row.trend === "صاعد" && ups.length === 0) {
    out.push("صعد بلا تغيّر سعر — طلبٌ حقيقي يستحقّ التوسّع");
  }

  if (!out.length) {
    out.push(row.trend === "نازل" ? "لا سبب في البيانات — يحتاج نظرةً في المطبخ" : "تحرّك بلا سببٍ مسجَّل");
  }
  return out;
}
