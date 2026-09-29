import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/cafe/menu-data";
import { imgSrcs } from "@/lib/cafe/menu-img";
import { BRAND } from "@/lib/brand";
import { StudentLandingClient } from "@/components/cafe/StudentLandingClient";
import type { Shot } from "@/components/cafe/OrderLandingClient";

/**
 * `/student` — واجهة برنامج دعم الطلبة.
 *
 * كانت تحويلاً إلى الاستمارة، وهذا رابطٌ يُلصَق على جدار كلّية ويُرسَل في
 * مجموعة صفّ — فاستمارةٌ عارية أول ما يراه الطالب لا تُعلَن. الآن صفحةٌ تقول
 * ما البرنامج ولمن قبل أن تطلب منه شيئاً، والاستمارة خلف زرّ.
 *
 * والصور من المنيو نفسه، منسوجةً بين الأقسام كما في `/order`: ثلاث صور دجاجٍ
 * متجاورة تبدو خطأً، والتناوب يعطي بيتزا ثم دجاجاً ثم مشروباً.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `ستيشن مع الطالب — دعم طلبة الأنبار 🎓`,
  description:
    "برنامج دعم الطلبة في مطعم المحطة — من الابتدائية إلى الجامعة. أسعار خاصّة للطالب، أصناف تخصّكم، ونقاط على كل زميل تدعوه.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "ستيشن مع الطالب — من الابتدائية إلى الجامعة",
    description: "أسعار خاصّة للطالب وأصناف تخصّكم. سجّل بدقيقة.",
    siteName: BRAND.nameAr,
    locale: "ar_IQ",
    type: "website",
  },
};

export default async function StudentLandingPage() {
  let shots: Shot[] = [];
  try {
    const menu = await getPublicMenu();
    const byCat = menu.map((c) => c.items.filter((i) => i.image_url));
    const deepest = Math.max(0, ...byCat.map((c) => c.length));
    const woven = [];
    for (let i = 0; i < deepest; i++) for (const cat of byCat) if (cat[i]) woven.push(cat[i]);
    shots = woven.slice(0, 14).map((i) => imgSrcs(i.image_url)).filter((s): s is Shot => !!s);
  } catch {
    // بلا صور: الشريطان يختفيان ويبقى المحتوى — وهو المقصود
  }
  return <StudentLandingClient shots={shots} />;
}
