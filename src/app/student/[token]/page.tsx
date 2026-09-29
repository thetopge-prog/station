import type { Metadata } from "next";
import { getStudentCard } from "@/lib/cafe/student-actions";
import { getPublicMenu, getStudentMenu } from "@/lib/cafe/menu-data";
import { getActiveItemOffers } from "@/lib/cafe/offer-actions";
import { isShopOpen } from "@/lib/cafe/shop-open";
import { ShopClosed } from "@/components/cafe/ShopClosed";
import { MenuClient } from "@/components/cafe/MenuClient";
import { StudentHeader } from "@/components/cafe/StudentHeader";

/**
 * منيو الطالب.
 *
 * الرمز في المسار هو الإذن — نفس منطق `/card/[serial]`: من يملك الرابط يملك
 * الصفحة، فلا كلمة مرور على زبونٍ لن يحفظها.
 *
 * **والرمز يفتح الصفحة، والقبول وحده يفتح السعر.** فالطالب قيد المراجعة يرى
 * المنيو العادي بأسعاره العادية — لا أصناف طلاب في سلّته يرفضها الخادم عند
 * الإرسال، ولا خصم قبل أن يقبله إنسان. والتسعير النهائي يقع في `place_order`
 * الذي يقرأ حالته من القاعدة، لا من هذه الصفحة.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "منيو الطلاب — ستيشن",
  robots: { index: false, follow: false },
};

export default async function StudentMenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const card = await getStudentCard(token);

  if (!card) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="text-2xl font-black">الرابط غير صحيح</p>
          <p className="text-sm font-bold text-muted-foreground">
            تأكّد من الرابط، أو سجّل من جديد عبر <b>stationiraq.com/student</b>
          </p>
        </div>
      </main>
    );
  }

  if (!(await isShopOpen())) {
    return (
      <>
        <StudentHeader card={card} />
        <ShopClosed />
      </>
    );
  }

  const active = card.status === "active";
  const [menu, offers] = await Promise.all([
    active ? getStudentMenu() : getPublicMenu(),
    getActiveItemOffers().catch(() => ({})),
  ]);

  return (
    <>
      <StudentHeader card={card} />
      <MenuClient
        menu={menu}
        channel="qr"
        offers={offers}
        initialMode="pickup"
        studentId={active ? card.id : null}
        layout="tiles"
      />
    </>
  );
}
