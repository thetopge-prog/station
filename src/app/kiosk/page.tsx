import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveOffers } from "@/lib/cafe/pastry-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { ModernMenuClient } from "@/components/cafe/ModernMenuClient";

export const dynamic = "force-dynamic";

/** المنيو اللوحي — نفس المودرن التفاعلي لكن بقناة kiosk للتقارير. */
export default async function KioskPage() {
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveOffers().catch(() => [])]);
  return <ModernMenuClient menu={menu} offers={offers} channel="kiosk" demo={isDemoServer()} />;
}
