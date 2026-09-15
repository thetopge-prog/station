import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/offer-actions";
import { MenuClient } from "@/components/cafe/MenuClient";
import { toFulfilmentMode } from "@/lib/cafe/fulfilment";

export const dynamic = "force-dynamic";

/**
 * منيو الزبون — القالب الذي اعتمدته الإدارة: شريط العروض ثم شبكة الأقسام
 * بالصور، والنقر على قسم يفتح قائمته.
 *
 * ‎/menu?t=رقم‎ من بطاقة الطاولة يثبّت «داخل المطعم»، و‎?mode=delivery|pickup|curbside‎
 * من روابط ‎/delivery‎ و‎/pickup‎ و‎/car‎ (شاشة ‎/order‎ وواتساب) يفتحه على طريقة
 * الاستلام وما تطلبه: العنوان للتوصيل، وصف السيارة لمن ينتظر فيها.
 */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ t?: string; mode?: string }> }) {
  const sp = await searchParams;
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveItemOffers().catch(() => ({}))]);
  return <MenuClient menu={menu} table={sp.t ?? null} channel="qr" offers={offers} initialMode={toFulfilmentMode(sp.mode)} layout="tiles" />;
}
