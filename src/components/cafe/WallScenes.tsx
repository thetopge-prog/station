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
 * لا تخطيطَ مرناً ولا نِسَبَ عناصر — النسبة في `translate` تُحسب من عرض العنصر
 * نفسه لا من الشاشة، فكلمةٌ صغيرة تبقى مكانها مهما كتبتَ.
 */

/** مركز الجدار: حدّ الشاشتين ٢ و٣ */
const MID = "200vw";

/** ارتفاع الخطّ الرئيسي — بالارتفاع لا بالعرض، فلا يتضخّم على جدارٍ أعرض */
const H1 = "22vh";

/**
 * كم يُمطّ حرف التطويل.
 *
 * الحرف الواحد عرضه نحو نصف ارتفاع الخطّ، والمطلوب أن يملأ ما بين الشطرين —
 * نحو ٢٥٦٪ من عرض الشاشة. الرقم يُضبط بالعين مرّة على الجدار، ومكتوبٌ هنا
 * باسمه لا رقماً سحرياً في ملفّ الأنماط.
 */
const TATWEEL_SCALE = 150;

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
        {WALL_COPY.name}
      </span>
    </div>
  );
}

/**
 * ٠٢–٠٤ — التمدّد، ثم «تفزعلك» فوقها، ثم سفر التكوين.
 *
 * ثلاثة مشاهد في طبقةٍ واحدة لأنها حركةٌ واحدة متّصلة: الكلمة نفسها تتمدّد
 * فيُختم فوقها فتسافر. فصلُها لأدّى إلى وميضٍ عند كل انتقال.
 *
 * والشطران ينفتحان كما لو ضُغط التطويل بينهما: «المحـ» تنزلق يميناً و«ـطة»
 * يساراً، وحرف «ـ» بينهما يُمطّ. الثلاثة من الخطّ نفسه وعلى خطّ الأساس نفسه،
 * فلا يُرى إلا كلمةً واحدة استطالت — لا خطّاً برتقالياً وُضع تحتها.
 */
function SceneLockup() {
  return (
    // طبقةٌ تحمل سفر التكوين كلّه، وأبناؤها يتحرّكون داخلها
    <div className="wall-scene wall-anim" style={{ animationName: "wall-lockup" }}>
      {/* الظهور والاختفاء على هذا الغلاف، وحركة الأجزاء على أبنائه: خاصيّة
          `transform` واحدة لا تحتمل حركتين معاً */}
      <div className="wall-anim" style={{ ...at(MID), animationName: "wall-word" }}>
        <span style={{ position: "relative", display: "block", fontSize: H1, width: 0, height: "1em" }}>
          <Part text={WALL_COPY.nameHead} anim="wall-head" />

          {/* حرف التطويل نفسه، مُمطّاً. لا شريطَ مرسوماً: هذا ما يُكتب بـ
              Shift+J، وسماكته ووصله بالحاء والطاء من الخطّ لا من تقديرنا */}
          <span
            className="wall-anim wall-display"
            style={
              {
                position: "absolute",
                left: 0,
                top: 0,
                transformOrigin: "50% 50%",
                animationName: "wall-tatweel",
                ["--tw-max"]: TATWEEL_SCALE,
              } as CSSProperties
            }
          >
            {WALL_COPY.tatweel}
          </span>

          <Part text={WALL_COPY.nameTail} anim="wall-tail" />
        </span>
      </div>

      {/* «تفزعلك» فوق الكلمة، بأسلوبٍ آخر، تظهر نابضة */}
      <span
        className="wall-anim wall-stamp"
        style={{
          position: "absolute",
          left: MID,
          // فوق الاسم بمقدار ارتفاعه تقريباً، فلا يلمس أحدُهما الآخر
          top: `calc(50% - ${H1} * 1.15)`,
          fontSize: `calc(${H1} * 0.72)`,
          display: "block",
          animationName: "wall-verb",
        }}
      >
        {WALL_COPY.verb}
      </span>
    </div>
  );
}

/** شطرٌ من الاسم ينزلق إلى طرف الجدار */
function Part({ text, anim }: { text: string; anim: string }) {
  return (
    <span
      className="wall-anim wall-display"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        animationName: anim,
      }}
    >
      {text}
    </span>
  );
}

/** موضعٌ مطلق على اللوحة: مركزه عند `x`، ومركزه رأسياً */
function at(x: string): CSSProperties {
  return {
    position: "absolute",
    left: x,
    top: "50%",
    marginTop: "-0.5em",
    display: "block",
  };
}
