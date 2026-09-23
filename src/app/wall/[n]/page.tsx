import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../wall.css";
import { bezelPx, clockAt, loopPhase, nowMs, screenIndex } from "@/lib/cafe/wall";
import { WallCanvas } from "@/components/cafe/WallCanvas";
import { WallScenes } from "@/components/cafe/WallScenes";

/**
 * شاشةٌ واحدة من جدار «المحطة».
 *
 * أربع صفحات مستقلّة (`/wall/1` … `/wall/4`) ترسم **تصميماً واحداً** بعرض أربع
 * شاشات، كلٌّ منها تُظهر ربعها. فتبدو للواقف لوحةً رقمية واحدة تعبرها الحروف
 * والطعام، لا أربع شاشاتٍ عليها فيديو.
 *
 * عامّة بلا تسجيل دخول: شاشةٌ معلّقة على جدارٍ لا أحد يسجّل لها دخولاً، وليس
 * عليها ما يُخفى — لا أسعار ولا طلبات ولا بيانات زبون. نفس منطق `/tv/[key]`
 * لكن بلا مفتاح، لأن هذه لا تقرأ من القاعدة شيئاً أصلاً.
 *
 * والطور يُحسب هنا — **على الخادم** — لا على الجهاز: أربعة أجهزة منفصلة لها
 * أربع ساعات تنحرف، ولو حسب كلٌّ منها طوره لسبقت شاشةٌ أختها بثوانٍ يراها
 * الناظر. ساعةُ الخادم واحدة.
 */
export const dynamic = "force-dynamic";

/** ما تعرضه الدورة كلّها — يُحمَّل مقدّماً */
const WALL_IMAGES = [
  "burger-1.webp",
  "burger-2.webp",
  "burger-3.webp",
  "burger-4.webp",
  "burger-5.webp",
  "burger-6.webp",
  "burger-whole.webp",
  "rizo.webp",
  "rizo-motion.webp",
  "chicken.webp",
  // ملصقات المحل: في أعمدة الأطراف وفي مشهد الصور وفي الشريط. مصغَّرةٌ إلى
  // `wallimg/` — الأصل في `public/posters/` ١٫٤ ميغابايت، وهذه ٣٩٢ كيلوبايت
  ...[1, 2, 3, 4, 5, 6, 7, "m1", "m2"].map((n) => `poster-${n}.webp`),
];

export const metadata: Metadata = {
  title: "المحطة",
  robots: { index: false, follow: false },
};

export default async function WallPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { n } = await params;
  const screen = screenIndex(n);
  if (screen === null) notFound();

  const sp = await searchParams;
  // `?t=` يجمّد اللوحة عند لحظةٍ بعينها — للتصوير وإثبات الاتّصال بين الشاشات
  const phase = loopPhase(clockAt(sp.t, nowMs()));
  const bezel = bezelPx(sp.bezel);

  return (
    <>
      {/* كل صور الدورة تُحمَّل قبل أن تبدأ.
          الجدار يدور ساعاتٍ بلا توقّف، فصورةٌ تُطلَب لحظةَ ظهورها تصل متأخّرة
          فيومض مكانها فارغاً كل دورة. والمجموع ٦٦٢ كيلوبايت — دون الميزانية،
          و٢٫٩م هي الحمولة التي سقطت فعلاً على هذا الجهاز من قبل. */}
      {WALL_IMAGES.map((src) => (
        <link key={src} rel="preload" as="image" href={`/wallimg/${src}`} />
      ))}
      <WallCanvas screen={screen} phaseMs={phase} bezel={bezel}>
        <WallScenes />
      </WallCanvas>
    </>
  );
}
