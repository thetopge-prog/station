"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";
import { businessDay } from "./time";
import { causes, kitchenWatch, pctChange, type CatState, type PriceEvent } from "./kitchen-watch";

/**
 * مراقبة المطبخ — أسبوعٌ مقابل أسبوع.
 *
 * `requireStaff` لا `requireAdmin`: الشاشة كمّياتٌ ونِسَب ولا دينار فيها،
 * والطبّاخ ورئيس الوردية هم من يقرؤها. وقاعدة المالك أن الكاشير لا يرى
 * الأرباح — ولا يراها هنا، لأن المال لا يدخل هذا الملفّ أصلاً.
 */

/** طول النافذة: أسبوعٌ يُقارن بأسبوع — أقصرُ منه يقيس يوم جمعةٍ لا اتجاهاً */
const WIN = 7;

export type WatchItem = { name: string; recent: number; prior: number; changePct: number };

export type CatReport = CatState & {
  why: string[];
  /** أكثر ثلاثة أصناف حرّكت القسم — المطبخ يجهّز صنفاً لا قسماً */
  movers: WatchItem[];
};

export type KitchenWatch = {
  from: string;
  to: string;
  priorFrom: string;
  /** تحرّك المحل كلّه بالطلبات — المسطرة التي يُنسَب إليها كل قسم */
  shopPct: number;
  shopRecent: number;
  shopPrior: number;
  cats: CatReport[];
  /** تغيّرات الأسعار داخل النافذة — شواهد لا أحكام */
  priceEvents: PriceEvent[];
};

const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function kitchenWatchReport(today = businessDay()): Promise<KitchenWatch> {
  await requireStaff();
  const svc = createSupabaseServiceClient();

  // أمس هو آخر يومٍ مكتمل: يوم اليوم ناقصٌ بطبيعته ويشوّه المقارنة
  const to = shift(today, -1);
  const from = shift(to, -(WIN - 1));
  const priorTo = shift(from, -1);
  const priorFrom = shift(priorTo, -(WIN - 1));

  const [recent, prior, recentDays, priorDays, prices] = await Promise.all([
    svc.rpc("sales_by_item_day", { p_from: from, p_to: to }),
    svc.rpc("sales_by_item_day", { p_from: priorFrom, p_to: priorTo }),
    svc.rpc("range_summary", { p_from: from, p_to: to }),
    svc.rpc("range_summary", { p_from: priorFrom, p_to: priorTo }),
    svc.from("price_log").select("name_ar, old_price, new_price, business_day, kind").gte("business_day", priorFrom).eq("kind", "price"),
  ]);

  type Row = { name_ar: string; category_name: string; qty: number };
  const fold = (rows: Row[] | null) => {
    const byCat = new Map<string, number>();
    const byItem = new Map<string, { cat: string; qty: number }>();
    for (const r of rows ?? []) {
      const cat = r.category_name;
      if (!cat || cat === "—") continue;
      const q = Number(r.qty);
      byCat.set(cat, (byCat.get(cat) ?? 0) + q);
      const cur = byItem.get(r.name_ar);
      byItem.set(r.name_ar, { cat, qty: (cur?.qty ?? 0) + q });
    }
    return { byCat, byItem };
  };
  const R = fold(recent.data as Row[] | null);
  const P = fold(prior.data as Row[] | null);

  const orders = (d: unknown) =>
    ((d ?? []) as { orders_count: number }[]).reduce((s, x) => s + Number(x.orders_count), 0);
  const shopRecent = orders(recentDays.data);
  const shopPrior = orders(priorDays.data);
  const shopPct = pctChange(shopRecent, shopPrior);

  const names = new Set([...R.byCat.keys(), ...P.byCat.keys()]);
  const states = kitchenWatch(
    [...names].map((n) => ({ name: n, recent: R.byCat.get(n) ?? 0, prior: P.byCat.get(n) ?? 0 })),
    shopPct,
  );

  const priceEvents: PriceEvent[] = ((prices.data ?? []) as { name_ar: string; old_price: number | null; new_price: number | null; business_day: string }[])
    .filter((p) => p.old_price != null && p.new_price != null)
    .map((p) => ({ name: p.name_ar, at: String(p.business_day).slice(5), from: p.old_price!, to: p.new_price! }));

  // أي أصناف حرّكت كل قسم، وأي تغيّرات سعرٍ تخصّه
  const itemsOf = (cat: string): WatchItem[] => {
    const all = new Set<string>();
    for (const [n, v] of R.byItem) if (v.cat === cat) all.add(n);
    for (const [n, v] of P.byItem) if (v.cat === cat) all.add(n);
    return [...all]
      .map((n) => {
        const rq = R.byItem.get(n)?.qty ?? 0;
        const pq = P.byItem.get(n)?.qty ?? 0;
        return { name: n, recent: rq, prior: pq, changePct: pctChange(rq, pq) };
      })
      .filter((i) => Math.abs(i.recent - i.prior) >= 3)
      .sort((a, b) => Math.abs(b.recent - b.prior) - Math.abs(a.recent - a.prior))
      .slice(0, 3);
  };

  return {
    from,
    to,
    priorFrom,
    shopPct,
    shopRecent,
    shopPrior,
    priceEvents,
    cats: states.map((s) => {
      const movers = itemsOf(s.name);
      const mine = priceEvents.filter((p) => movers.some((m) => p.name.startsWith(m.name)) || p.name.includes(s.name));
      return { ...s, movers, why: causes(s, mine, shopPct) };
    }),
  };
}
