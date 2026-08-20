import { getPublicMenu } from "@/lib/cafe/menu-data";
import { isDemoServer } from "@/lib/cafe/demo";
import { MenuOrderClient } from "@/components/cafe/MenuOrderClient";

export const dynamic = "force-dynamic";

/** المنيو الكلاسيكي — يُفتح من مبدّل «كلاسيكي» أعلى المنيو المودرن. */
export default async function ClassicMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const menu = await getPublicMenu();
  return <MenuOrderClient menu={menu} channel="qr" table={sp.t ?? null} demo={isDemoServer()} />;
}
