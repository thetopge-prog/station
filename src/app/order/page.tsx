import { getPublicMenu } from "@/lib/cafe/menu-data";
import { OrderLandingClient, type Shot } from "@/components/cafe/OrderLandingClient";
import { imgSrcs } from "@/lib/cafe/menu-img";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

/**
 * /order — شاشة اختيار طريقة الاستلام.
 *
 * عامّة بلا تسجيل دخول، ورابطها هو ما يُرسل للزبون. الأزرار الثلاثة تقود إلى
 * ‎/delivery‎ و‎/pickup‎ و‎/car‎، وهي تحويلات موجودة أصلاً تفتح المنيو على
 * الطريقة المطلوبة، فلا منطق جديد هنا ولا حالة.
 */
export const dynamic = "force-dynamic";

/**
 * معاينة الرابط في واتساب وتلغرام: صورة تقول «اطلب من هنا» ونصّ يقول ما يفعله
 * الرابط — لا شعار المتصفح الافتراضي وعنوان الموقع.
 */
export const metadata: Metadata = {
  title: `اطلب من ${BRAND.nameAr} 🍔`,
  description: "اضغط الرابط واختر: توصيل لباب البيت، استلام من المطعم، أو من السيارة دون نزول — يصلك رقم طلبك فوراً.",
  openGraph: {
    title: `اطلب من ${BRAND.nameAr} — توصيل · استلام · من السيارة`,
    description: "اضغط الرابط واختر طلبك، ويصلك رقم الطلب فوراً.",
    siteName: BRAND.nameAr,
    locale: "ar_IQ",
    type: "website",
    images: [{ url: "/og-order.png", width: 1200, height: 630, alt: `اطلب من ${BRAND.nameAr}` }],
  },
  twitter: { card: "summary_large_image", images: ["/og-order.png"] },
};

export default async function OrderPage() {
  let shots: Shot[] = [];
  try {
    const menu = await getPublicMenu();
    // تناوبٌ بين الأقسام لا سردٌ لها: أخذ الأقسام بالترتيب يضع ثلاث صور دجاج
    // متشابهة جنباً إلى جنب فتبدو كخطأ. الدورة تعطي بيتزا ثم دجاجاً ثم مشروباً.
    const byCat = menu.map((c) => c.items.filter((i) => i.image_url));
    const deepest = Math.max(0, ...byCat.map((c) => c.length));
    const woven = [];
    for (let i = 0; i < deepest; i++) for (const cat of byCat) if (cat[i]) woven.push(cat[i]);
    shots = woven.slice(0, 14).map((i) => imgSrcs(i.image_url)).filter((s): s is Shot => !!s);
  } catch {
    // بلا صور: الشريطان يختفيان والأزرار تبقى — وهي المقصودة
  }
  return <OrderLandingClient shots={shots} />;
}
