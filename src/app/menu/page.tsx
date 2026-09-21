import { getPublicMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/offer-actions";
import { MenuClient } from "@/components/cafe/MenuClient";
import { toFulfilmentMode } from "@/lib/cafe/fulfilment";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { isShopOpen } from "@/lib/cafe/shop-open";
import { ShopClosed } from "@/components/cafe/ShopClosed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `منيو ${BRAND.nameAr} — اطلب من هنا`,
  description: "اختر أصنافك واطلب: توصيل، استلام من المطعم، أو من السيارة — يصلك رقم طلبك فوراً.",
  openGraph: {
    title: `اطلب من ${BRAND.nameAr} 🍔`,
    description: "اضغط الرابط واختر طلبك، ويصلك رقم الطلب فوراً.",
    siteName: BRAND.nameAr,
    locale: "ar_IQ",
    type: "website",
    images: [{ url: "/og-order.png", width: 1200, height: 630, alt: `اطلب من ${BRAND.nameAr}` }],
  },
  twitter: { card: "summary_large_image", images: ["/og-order.png"] },
};

/**
 * منيو الزبون — القالب الذي اعتمدته الإدارة: شريط العروض ثم شبكة الأقسام
 * بالصور، والنقر على قسم يفتح قائمته.
 *
 * ‎/menu?t=رقم‎ من بطاقة الطاولة يثبّت «داخل المطعم»، و‎?mode=delivery|pickup|curbside‎
 * من روابط ‎/delivery‎ و‎/pickup‎ و‎/car‎ (شاشة ‎/order‎ وواتساب) يفتحه على طريقة
 * الاستلام وما تطلبه: العنوان للتوصيل، وصف السيارة لمن ينتظر فيها.
 */
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ t?: string; mode?: string; phone?: string }> }) {
  const sp = await searchParams;
  if (!(await isShopOpen())) return <ShopClosed />;
  const [menu, offers] = await Promise.all([getPublicMenu(), getActiveItemOffers().catch(() => ({}))]);
  return <MenuClient menu={menu} table={sp.t ?? null} channel="qr" offers={offers} initialMode={toFulfilmentMode(sp.mode)} initialPhone={sp.phone ?? null} layout="tiles" />;
}
