import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/offer-actions";
import { MenuClient } from "@/components/cafe/MenuClient";
import { isShopOpen } from "@/lib/cafe/shop-open";
import { ShopClosed } from "@/components/cafe/ShopClosed";

export const dynamic = "force-dynamic";

/** نفس ‎/menu‎ — يبقى لأن بطاقات طاولات قديمة تحمل هذا المسار. */
export default async function TabletMenuPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  if (!(await isShopOpen())) return <ShopClosed />;
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveItemOffers().catch(() => ({}))]);
  return <MenuClient menu={menu} table={sp.t ?? null} channel="qr" offers={offers} layout="tiles" />;
}
