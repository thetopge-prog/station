import type { Metadata } from "next";
import { getMyOrders } from "@/lib/cafe/order-actions";
import { PagerClient } from "@/components/cafe/PagerClient";

/**
 * `/t/<uuid>` — صفحة البيجر التي يفتحها رمز الإيصال.
 *
 * المعرّف هو الإذن، كما في `cancel_my_order` و`/card/[serial]`: من يملك الرابط
 * يملك الطلب. ولذلك هو **uuid** لا «رقم الطلب-رمز الاستلام» — ذاك ثلاثة أحرف
 * تُعاد كل يوم، أي يُخمَّن، وصفحةٌ تفتح اشتراك إشعارات لا تُحرَس بما يُخمَّن.
 *
 * ومفتاح VAPID العامّ يُقرأ هنا ويُمرَّر: لا متغيّر `NEXT_PUBLIC_` له في هذا
 * المستودع، وشاشة الموظفين تمرّره بالطريقة نفسها.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "طلبك — ستيشن",
  robots: { index: false, follow: false },
};

export default async function PagerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order] = await getMyOrders([id]).catch(() => []);

  if (!order) {
    return (
      <main dir="rtl" className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <p className="text-2xl font-black">ما لكينا هذا الطلب</p>
          <p className="text-sm font-bold text-muted-foreground">تأكّد من الرابط أو اسأل الكاشير.</p>
        </div>
      </main>
    );
  }

  const phase =
    order.status === "cancelled"
      ? "cancelled"
      : order.prep_status === "ready"
        ? "ready"
        : order.prep_status === "handed"
          ? "handed"
          : "preparing";

  return (
    <PagerClient
      orderId={order.id}
      orderSeq={String(order.order_seq).padStart(3, "0")}
      pickupCode={order.pickup_code}
      initialPhase={phase}
      pushKey={process.env.WEB_PUSH_PUBLIC_KEY ?? null}
    />
  );
}
