import type { CSSProperties } from "react";
import { WALL_COPY } from "@/lib/cafe/wall";

/**
 * مشاهد الجدار — ترميزٌ للتصميم لا منطق.
 *
 * كل عنصرٍ هنا له **موضعٌ واحد على اللوحة** بعرض أربع شاشات، ويتحرّك داخلها.
 * لا نسخةَ له في كل شاشة، ولا تسليمَ عند الحدود: الشاشة تُظهر ما يقع في
 * نافذتها من حركةٍ واحدة. وهذا ما لا تستطيعه أربعة فيديوهات منفصلة.
 *
 * والمواضع كلّها **مطلقة بـ`vw` من يسار اللوحة**: `50vw` منتصف الشاشة الأولى،
 * و`200vw` مركز الجدار (حدّ الشاشتين الوسطى، حيث يقف الناظر)، و`400vw` طرفه.
 * لا تخطيطَ مرناً ولا نِسَبَ عناصر — جرّبتُ ذلك أولاً فتراكبت الكلمات، لأن
 * النسبة في `translate` تُحسب من عرض العنصر نفسه لا من الشاشة.
 */

/** مركز الجدار: حدّ الشاشتين ٢ و٣ */
const MID = "200vw";

/** ارتفاع الخطّ الرئيسي — بالارتفاع لا بالعرض، فلا يتضخّم على جدارٍ أعرض */
const H1 = "22vh";

export function WallScenes() {
  return (
    <>
      <SceneName />
      <SceneLockup />
    </>
  );
}

/**
 * ٠١ — «المحطة» تدخل في مركز الجدار على فراغٍ واسع.
 *
 * فراغٌ كبير عمداً: الجمهور يقرأ من بعيد، والمشهد المزدحم من تلك المسافة
 * ضجيجٌ لا رسالة.
 */
function SceneName() {
  return (
    <div className="wall-scene">
      <span className="wall-anim wall-display" style={{ ...at(MID), fontSize: H1, animationName: "wall-name" }}>
        {WALL_COPY.nameHead}
        {WALL_COPY.nameTail}
      </span>
    </div>
  );
}

/**
 * ٠٢–٠٤ — التمدّد، ثم خروج «تفزعلك»، ثم سفر التكوين كاملاً.
 *
 * ثلاثة مشاهد في طبقةٍ واحدة لأنها حركةٌ واحدة متّصلة: الكلمة نفسها تتمدّد
 * فتنفتح فتسافر. فصلُها لأدّى إلى وميضٍ عند كل انتقال.
 *
 * والشطران عنصران منفصلان يبدآن من المركز نفسه ثم يتباعدان — «المح» يميناً
 * و«طة» يساراً، فالعربية تُقرأ من اليمين — وبينهما الوصل المتمدّد. فلا تطويلَ
 * مكرّراً ولا حرفَ «ـ» مصفوفاً.
 */
function SceneLockup() {
  return (
    // طبقةٌ تحمل سفر التكوين كلّه، وأبناؤها يتحرّكون داخلها
    <div className="wall-scene wall-anim" style={{ animationName: "wall-lockup" }}>
      {/* الوصل: شطران يخرجان من المركز ثم ينحسران عنه ليفتحا مكان العبارة */}
      <Kashida side="right" />
      <Kashida side="left" />

      <span className="wall-anim wall-display" style={{ ...at(MID), fontSize: H1, animationName: "wall-head" }}>
        {WALL_COPY.nameHead}
      </span>
      <span className="wall-anim wall-display" style={{ ...at(MID), fontSize: H1, animationName: "wall-tail" }}>
        {WALL_COPY.nameTail}
      </span>

      {/* «تفزعلك» تخرج من جوف الوصل في المركز */}
      <span
        className="wall-anim wall-display"
        style={{ ...at(MID), fontSize: `calc(${H1} * 0.86)`, animationName: "wall-verb" }}
      >
        {WALL_COPY.verb}
      </span>
    </div>
  );
}

/**
 * نصف الوصل.
 *
 * يخرج من مركز الجدار إلى طرفه، ومنشؤه (`transformOrigin`) عند المركز — فهو
 * ينبت من الكلمة لا ينزلق إليها. وسماكته من ارتفاع الخطّ لا رقماً بالبكسل،
 * فيبقى امتداداً للحرف على أي مقاس شاشة.
 */
function Kashida({ side }: { side: "right" | "left" }) {
  const right = side === "right";
  return (
    <span
      aria-hidden
      className="wall-anim"
      style={{
        position: "absolute",
        left: MID,
        // خطّ الأساس العربي يقع نحو خُمس ارتفاع الحرف تحت وسطه
        top: `calc(50% + ${H1} * 0.17)`,
        width: "129vw",
        height: `calc(${H1} * 0.13)`,
        background: "#ff6b00",
        transformOrigin: right ? "0% 50%" : "100% 50%",
        ...(right ? {} : { marginLeft: "-129vw" }),
        animationName: right ? "wall-kashida-r" : "wall-kashida-l",
      }}
    />
  );
}

/**
 * موضعٌ مطلق على اللوحة: مركزه عند `x`، ومركزه رأسياً.
 *
 * والإزاحة الأفقية `-50%` تُكتب داخل كل `@keyframes` لا هنا: `transform` خاصيّة
 * واحدة، فلو وُضع التوسيط هنا لمحته الحركة أول إطار — وهو عطلٌ يظهر قفزةً
 * بنصف عرض الكلمة في اللحظة التي تبدأ فيها.
 */
function at(x: string): CSSProperties {
  return {
    position: "absolute",
    left: x,
    top: "50%",
    marginTop: "-0.5em",
    display: "block",
  };
}
