import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/offer-actions";
import { MenuClient } from "@/components/cafe/MenuClient";
import { toFulfilmentMode } from "@/lib/cafe/fulfilment";

/**
 * /menunew — المنيو الجديد، للعرض على الإدارة قبل أن يحلّ محلّ /menu.
 *
 * نفس البيانات ونفس الطلب ونفس الخادم؛ الجديد كلّه في المكوّن. حين يوافقون
 * يصير هذا هو /menu وتُحذف النسخة القديمة، وحتى ذلك الحين يعيش الاثنان جنباً
 * إلى جنب ولا يلمس أحدهما الآخر.
 */
export const dynamic = "force-dynamic";

export default async function MenuNewPage({ searchParams }: { searchParams: Promise<{ t?: string; mode?: string }> }) {
  const sp = await searchParams;
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveItemOffers().catch(() => ({}))]);
  return <MenuClient menu={menu} table={sp.t ?? null} channel="qr" offers={offers} initialMode={toFulfilmentMode(sp.mode)} />;
}
