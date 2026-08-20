import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/pastry-actions";
import { TabletMenuClient } from "@/components/cafe/TabletMenuClient";
import { toFulfilmentMode } from "@/lib/cafe/fulfilment";

export const dynamic = "force-dynamic";

/** المنيو الأساسي للزبون — النظام اللوحي (أقسام يمين + شبكة صور + سلة وطلب).
 *  كل روابط/بطاقات الطاولات تفتح هنا: /menu?t=رقم-الطاولة.
 *  و ?mode=delivery|pickup|curbside|dinein يفتح المنيو على طريقة استلام محددة —
 *  وهو ما تستعمله روابط /delivery و /pickup و /car المرسلة عبر واتساب. */
export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const mode = toFulfilmentMode(sp.mode);
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveItemOffers().catch(() => ({}))]);
  return (
    <TabletMenuClient menu={menu} table={sp.t ?? null} channel="qr" offers={offers} initialMode={mode} />
  );
}
