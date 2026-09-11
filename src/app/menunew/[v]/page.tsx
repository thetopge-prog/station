import { notFound } from "next/navigation";
import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/offer-actions";
import { MenuClient, type MenuLayout } from "@/components/cafe/MenuClient";
import { toFulfilmentMode } from "@/lib/cafe/fulfilment";

/**
 * /menunew/2 و/3 و/4 — القوالب البديلة لعرض الإدارة إلى جانب /menunew.
 * نفس البيانات ونفس الطلب؛ الفرق كلّه في `layout`.
 */
export const dynamic = "force-dynamic";

const LAYOUTS: Record<string, MenuLayout> = { "2": "cards", "3": "split", "4": "tiles" };

export default async function MenuVariantPage({
  params,
  searchParams,
}: {
  params: Promise<{ v: string }>;
  searchParams: Promise<{ t?: string; mode?: string }>;
}) {
  const [{ v }, sp] = await Promise.all([params, searchParams]);
  const layout = LAYOUTS[v];
  if (!layout) notFound();
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveItemOffers().catch(() => ({}))]);
  return <MenuClient menu={menu} table={sp.t ?? null} channel="qr" offers={offers} initialMode={toFulfilmentMode(sp.mode)} layout={layout} />;
}
