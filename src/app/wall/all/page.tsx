import type { Metadata } from "next";
import "../../wall.css";
import { bezelPx, clockAt, loopPhase, nowMs, SCREENS } from "@/lib/cafe/wall";
import { WallCanvas } from "@/components/cafe/WallCanvas";
import { WallScenes } from "@/components/cafe/WallScenes";

/**
 * /wall/all — الجدار كلّه على شاشةٍ واحدة، للاطّلاع لا للتشغيل.
 *
 * أربع نوافذ متصفّحٍ لا تُريك التكوين: العين لا تجمع ما تفرّق على أربع شاشات،
 * ولا يمكن الحكم على لوحةٍ بعرض أربعة أمتار من ربعها. فهذه تعرض اللوحة كاملةً
 * بربع حجمها — شريطٌ عريضٌ في منتصف الشاشة، وخطوطٌ رفيعة تُري أين تقع حدود
 * الشاشات الأربع، فيُعرَف قبل التعليق أيُّ كلمةٍ ستُقطع على حدّ.
 *
 * ولا تُعلَّق هذه على الجدار: النصّ فيها بربع حجمه فلا يُقرأ من بعيد، والشاشة
 * الحقيقية تفتح /wall/1 … /wall/4.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "المحطة — الجدار كاملاً",
  robots: { index: false, follow: false },
};

export default async function WallAllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const phase = loopPhase(clockAt(sp.t, nowMs()));
  const bezel = bezelPx(sp.bezel);

  return (
    <>
      <WallCanvas screen={1} phaseMs={phase} bezel={bezel} preview>
        <WallScenes />
      </WallCanvas>
      {/* حدود الشاشات الأربع: ثلاثة خطوط لا أربعة. ترسم فوق اللوحة لا داخلها
          فلا تدخل التحجيم، وبها يُرى ما سيقع تحت إطار التلفزيون */}
      {Array.from({ length: SCREENS - 1 }, (_, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            top: "37.5vh",
            height: "25vh",
            left: `${((i + 1) * 100) / SCREENS}vw`,
            width: 2,
            background: "rgba(44,30,22,0.55)",
            zIndex: 9,
          }}
        />
      ))}
      <p
        dir="rtl"
        style={{
          position: "fixed",
          bottom: "4vh",
          left: 0,
          right: 0,
          textAlign: "center",
          margin: 0,
          color: "#2c1e16",
          fontSize: 18,
          fontWeight: 700,
          zIndex: 9,
        }}
      >
        عرضٌ مصغَّر للاطّلاع — اللوحة كاملةً بربع حجمها، والخطوط حدود الشاشات الأربع
      </p>
    </>
  );
}
