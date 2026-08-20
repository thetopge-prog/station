import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { cacheGet, cachePut, hubEnabled } from "./store";
import { cloudReachable } from "./net";
import type { NameMap, PriceBook, Routing } from "./local";
import type { MenuCategoryView } from "@/lib/cafe/menu-data";

/**
 * The reference data the shop needs to keep working with no line.
 *
 * Pulled on a timer while the connection is good rather than at the moment of
 * failure, because the moment of failure is exactly when it cannot be pulled.
 * Everything here is small, slow-changing and non-monetary: what things are
 * called, which oven cooks them, and who is on shift.
 *
 * What is NOT cached: prices as money. The hub prints names from this snapshot,
 * but every figure that reaches the books is recomputed cloud-side by
 * sync_hub_order. A stale till must not be able to rewrite the accounts.
 */

const K_MENU = "snapshot:menu";
const K_ROUTING = "snapshot:routing";
const K_PRICES = "snapshot:prices";
const K_NAMES = "snapshot:names";
const K_EXPEDITER = "snapshot:expediter";

export type Snapshot = { routing: Routing; prices: PriceBook; names: NameMap; expediterId: string | null };

export async function refreshSnapshot(): Promise<boolean> {
  if (!hubEnabled() || !(await cloudReachable())) return false;

  try {
    const svc = createSupabaseServiceClient();
    const [items, cats, stations, emps, variants] = await Promise.all([
      svc.from("menu_items").select("id, name_ar, category_id, flavors, is_active"),
      svc.from("categories").select("id, name_ar, station_id"),
      svc.from("stations").select("id, name_ar"),
      svc.from("employees").select("id, name_ar").eq("is_active", true),
      svc.from("item_variants").select("id, item_id, name_ar"),
    ]);
    // who is on assembly right now — every ticket must name them, and a shop
    // that loses the line mid-shift must not start printing anonymous ones
    const { data: shifts } = await svc.from("active_shifts").select("role, employee_id");
    if (!items.data?.length) return false;

    const cat = new Map((cats.data ?? []).map((c) => [c.id, c]));
    const stationName = new Map((stations.data ?? []).map((s) => [s.id, s.name_ar]));

    const routing: Routing = {};
    const prices: PriceBook = {};
    for (const i of items.data) {
      const c = i.category_id ? cat.get(i.category_id) ?? null : null;
      const sid = c?.station_id ?? null;
      routing[i.id] = {
        category_name: c?.name_ar ?? null,
        station_id: sid,
        station_name: sid ? stationName.get(sid) ?? null : null,
      };
      prices[i.id] = { name_ar: i.name_ar, flavors: i.flavors ?? [], variants: {} };
    }
    for (const v of variants.data ?? []) {
      const p = prices[v.item_id];
      if (p) p.variants[v.id] = { name_ar: v.name_ar };
    }

    const names: NameMap = {};
    for (const e of emps.data ?? []) names[e.id] = e.name_ar;

    const expediterId = (shifts ?? []).find((s) => s.role === "expediter")?.employee_id ?? null;

    await Promise.all([
      cachePut(K_ROUTING, routing),
      cachePut(K_PRICES, prices),
      cachePut(K_NAMES, names),
      cachePut(K_EXPEDITER, expediterId),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function readSnapshot(): Promise<Snapshot> {
  const [routing, prices, names, expediterId] = await Promise.all([
    cacheGet<Routing>(K_ROUTING),
    cacheGet<PriceBook>(K_PRICES),
    cacheGet<NameMap>(K_NAMES),
    cacheGet<string | null>(K_EXPEDITER),
  ]);
  return { routing: routing ?? {}, prices: prices ?? {}, names: names ?? {}, expediterId: expediterId ?? null };
}

/** The customer menu, kept so a tablet on the LAN still shows pictures and prices. */
export async function cacheMenu(menu: MenuCategoryView[]): Promise<void> {
  if (!hubEnabled() || !menu.length) return;
  await cachePut(K_MENU, menu);
}

export async function cachedMenu(): Promise<MenuCategoryView[] | null> {
  if (!hubEnabled()) return null;
  return cacheGet<MenuCategoryView[]>(K_MENU);
}
