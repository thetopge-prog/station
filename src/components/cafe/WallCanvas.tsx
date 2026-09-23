import type { ReactNode } from "react";
import { canvasWidth, sliceOffset } from "@/lib/cafe/wall";

/**
 * نافذةُ شاشةٍ واحدة على لوحةٍ واحدة.
 *
 * اللوحة عرضها `400vw` ويُرسَم عليها التصميم كاملاً مرّةً واحدة. وكل شاشة
 * تُزيح اللوحة بمقدار ربعٍ وتقصّ الباقي — فالعنصر الذي يعبر من الأولى إلى
 * الرابعة **يعبر داخل اللوحة نفسها**، لا أربع نسخٍ متّفقة على التظاهر.
 *
 * وبوحدات المنفذ لا بالبكسل: تلفزيون المحل يقرأ منفذه نحو ٩٦٠ بكسل على لوحة
 * 1080p — التلفزيونات تضاعف بكسلاتها — فأي رقمٍ مطلق يكسر نصف الأجهزة، و`vw`
 * تعني «عرض هذه الشاشة» أياً كان.
 *
 * والتزامن كلّه في سطرٍ واحد هنا: `animationDelay` سالبٌ يحسبه **الخادم** من
 * ساعته، فتقفز الشاشات الأربع إلى اللحظة نفسها من الدورة نفسها. ساعةُ الجهاز
 * لا تدخل الحساب — وهذا ما يجعل أربعة أجهزة منفصلة ممكنة أصلاً.
 */
export function WallCanvas({
  screen,
  phaseMs,
  bezel,
  children,
}: {
  screen: number;
  /** أين نحن من الدورة، بحساب الخادم */
  phaseMs: number;
  /** عرض حافّة الإطار بالبكسل — صفرٌ = لا تعويض */
  bezel: number;
  children: ReactNode;
}) {
  return (
    // أنماطٌ مضمّنة لا أصناف: مرّتين من قبل أعاد مُصغِّر CSS كتابة اختيارٍ
    // مقصود لمتصفّحٍ قديم — طوى الإزاحات الأربع إلى `inset` التي لا يعرفها
    // Chromium ٨٧. والمضمّن في HTML لا يمرّ على مُصغِّر
    <div
      dir="rtl"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: "hidden",
        background: "#2c1e16",
        cursor: "none",
      }}
    >
      <div
        className="wall-canvas"
        style={{
          position: "absolute",
          top: 0,
          left: sliceOffset(screen, bezel),
          width: canvasWidth(bezel),
          height: "100%",
          // الطور يُورَّث إلى كل متحرّك عبر متغيّر مخصّص: يُكتب هنا مرّة،
          // ويقرؤه كل عنصر. سالبٌ فيقفز بالدورة إلى موضعها بدل أن تبدأ من
          // رأسها — وبه وحده تتّفق أربع شاشاتٍ على أربعة أجهزة
          ["--wall-phase" as string]: `-${phaseMs}ms`,
        } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
