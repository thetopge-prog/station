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
 * الحرف الواحد عرضه نحو نصف ارتفاع الخطّ، والمطلوب أن يملأ ما بين الشطرين.
 * الرقم يُضبط بالعين مرّة على الجدار، ومكتوبٌ هنا باسمه لا رقماً سحرياً في
 * ملفّ الأنماط.
 */
const TATWEEL_SCALE = 150;

export function WallScenes() {
  return (
    <>
      <SceneName />
      <SceneLockup />
      <SceneFood />
      <SceneBurger />
      <SceneFresh />
      <SceneClean />
      <SceneBoard />
      <SceneStrip />
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

      {/* «تفزعلك» فوق الاسم وأكبر منه — كما على ملصقات المحطة: الاسم يُعرَف،
          والوعد هو ما يُقرأ من آخر الصالة. وحولها نجومٌ ترتعش من زينة الملصق */}
      <span
        className="wall-anim wall-stamp"
        style={{
          position: "absolute",
          left: MID,
          top: `calc(50% - ${H1} * 1.75)`,
          fontSize: `calc(${H1} * 1.4)`,
          display: "block",
          animationName: "wall-verb",
        }}
      >
        {WALL_COPY.verb}
      </span>
      <Star x="178vw" y={`calc(50% - ${H1} * 2.05)`} size="2.6vh" />
      <Star x="224vw" y={`calc(50% - ${H1} * 2.15)`} size="3.4vh" />
      <Star x="207vw" y={`calc(50% - ${H1} * 0.62)`} size="2.2vh" />
      <Star x="191vw" y={`calc(50% - ${H1} * 0.55)`} size="1.8vh" />
    </div>
  );
}

/**
 * ٠٥ — الطعام يتداخل مع الحروف.
 *
 * البركر يمرّ **أمام** الاسم كبيراً وسريعاً، والريزو **خلفه** أصغر وأبطأ،
 * والدجاجة تعبر شاشتين. اختلافُ السرعة مع اختلاف الحجم هو العمق — parallax
 * حقيقي بلا مرشّحٍ ضبابي يتعثّر به التلفزيون.
 */
function SceneFood() {
  return (
    <div className="wall-scene">
      {/* الخلف أولاً، فالاسم، فالأمام — ترتيب الرسم هو ترتيب العمق */}
      <Food src="rizo.webp" anim="wall-pass-back" size="62vh" y="16%" />
      <span
        className="wall-anim wall-display"
        style={{ position: "absolute", left: MID, top: "50%", marginTop: "-0.5em", display: "block", fontSize: `calc(${H1} * 0.95)`, animationName: "wall-word-bg" }}
      >
        {WALL_COPY.name}
      </span>
      <Food src="chicken.webp" anim="wall-pass-mid" size="52vh" y="46%" />
      <Food src="burger-whole.webp" anim="wall-pass-front" size="88vh" y="18%" />
    </div>
  );
}

/**
 * ٠٦ — تجميع البركر.
 *
 * ستّ طبقاتٍ تدخل من جهاتٍ مختلفة من الجدار — من الشاشة الأولى، ومن الرابعة،
 * ومن الأعلى — ثم تستقرّ في المركز بالترتيب من الأسفل إلى الأعلى. وكلّها في
 * الموضع الأفقي نفسه، فتنطبق طبقةً على طبقة كما صُوّرت.
 */
const BURGER_W = 56;

/**
 * ترتيب بناء البركر وموضع كل طبقة.
 *
 * `file` ليس بترتيب أرقام الملفّات: أرقامُ التصدير ليست ترتيبَ الأكل. الترتيب
 * هنا كما يُركَّب في اليد — خبزةٌ سفلى، فالقطعة، فالجبن، فالطماطة، فالخسّ،
 * فالخبزة العليا.
 *
 * و`bottom` ارتفاعُ قاعدة الطبقة فوق قاعدة البركر بوحدة `vh`. الطبقات مقصوصةٌ
 * إلى محتواها في `scripts/wall-assets.mjs`، فارتفاع كلٍّ منها = العرض ÷ نسبتها،
 * وهذه الأرقام محسوبةٌ منها بتداخلٍ يسير بين كل طبقةٍ وما تحتها.
 *
 * وقبل القصّ كانت الطبقات تُوسَّط رأسياً جميعاً، فتتكوّم مراكزها في مكانٍ واحد
 * بدل أن تُبنى بركراً — وهو ما رآه المالك.
 */
const BURGER_STACK = [
  { file: 1, bottom: 0 },
  { file: 4, bottom: 11 },
  { file: 2, bottom: 23 },
  { file: 3, bottom: 33 },
  { file: 5, bottom: 38 },
  { file: 6, bottom: 48 },
];

function SceneBurger() {
  return (
    <div className="wall-scene">
      {BURGER_STACK.map((l, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={l.file}
          className="wall-anim"
          src={`/wallimg/burger-${l.file}.webp`}
          alt=""
          style={{
            position: "absolute",
            left: MID,
            // من أسفل الشاشة لا من وسطها: البركر يُبنى على قاعدةٍ واحدة
            bottom: `calc(13vh + ${l.bottom}vh)`,
            width: `${BURGER_W}vh`,
            // ترتيب الوصول يتبع ترتيب البناء لا ترتيب الملفّات
            animationName: `wall-l${i + 1}`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * ٠٧ — «كل شيء طازج / ومن الرمادي».
 *
 * سطران: الأول يظهر لحظةَ انطباق آخر طبقة، والثاني بعد حركةٍ قصيرة. والكلمتان
 * المميَّزتان أكبر — فتُقرأ الرسالة من بعيد ولو فات الناظرَ باقي السطر.
 */
function SceneFresh() {
  return (
    <div className="wall-scene">
      <Line anim="wall-fresh1" y={`calc(50% - ${H1} * 1.45)`} text={WALL_COPY.freshTop} accent={WALL_COPY.freshAccentTop} />
      <Line anim="wall-fresh2" y={`calc(50% + ${H1} * 0.55)`} text={WALL_COPY.freshBottom} accent={WALL_COPY.freshAccentBottom} />
    </div>
  );
}

/**
 * ٠٨–٠٩ — المسح ورسالة النظافة.
 *
 * الجدار كلّه ينقلب إلى فاتحٍ هادئ: الإيقاع يتغيّر تماماً قبل رسالةٍ عن
 * الشفافية، فلا تُقال بلهجة إعلانٍ عن طعام. والمسح يزحف من اليمين لأن العربية
 * تُقرأ من اليمين.
 */
function SceneClean() {
  return (
    <div className="wall-scene" style={{ overflow: "hidden" }}>
      <div
        className="wall-anim"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: "#fffdfb",
          animationName: "wall-wipe",
        }}
      />
      <span
        className="wall-anim"
        style={{
          ...at(MID),
          fontSize: `calc(${H1} * 1.35)`,
          fontWeight: 900,
          color: "#2c1e16",
          whiteSpace: "nowrap",
          animationName: "wall-clean1",
        }}
      >
        {WALL_COPY.cleanLead}
      </span>
      <span
        className="wall-anim"
        style={{
          ...at(MID),
          fontSize: `calc(${H1} * 0.92)`,
          fontWeight: 900,
          color: "#b63f06",
          whiteSpace: "nowrap",
          animationName: "wall-clean2",
        }}
      >
        {WALL_COPY.cleanBody}
      </span>
    </div>
  );
}

/**
 * ١٠ — اللوحة الرقمية.
 *
 * أربع كتلٍ لونية تصعد فتبني لوحةً معاصرة: برتقالي وكاكاوي ومحايد، وصورةٌ في
 * كل كتلة وكلمةٌ واحدة. ليست شاشة أسعار — لا رقم فيها.
 */
const BOARD = [
  { x: "0vw", bg: "#2c1e16", img: "burger-whole.webp", word: "بركر" },
  { x: "100vw", bg: "#fffdfb", img: "rizo.webp", word: "ريزو" },
  { x: "200vw", bg: "#b63f06", img: "chicken.webp", word: "دجاج" },
  { x: "300vw", bg: "#2c1e16", img: "rizo-motion.webp", word: "ستيشن" },
];

function SceneBoard() {
  return (
    <div className="wall-scene">
      {BOARD.map((b) => (
        <div
          key={b.x}
          className="wall-anim"
          style={{
            position: "absolute",
            left: b.x,
            top: 0,
            bottom: 0,
            width: "100vw",
            background: b.bg,
            overflow: "hidden",
            animationName: "wall-block",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/wallimg/${b.img}`}
            alt=""
            style={{ position: "absolute", left: "50%", top: "42%", width: "64vh", marginLeft: "-32vh", marginTop: "-32vh" }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: "8%",
              transform: "translateX(-50%)",
              fontSize: `calc(${H1} * 0.62)`,
              fontWeight: 900,
              color: b.bg === "#fffdfb" ? "#2c1e16" : "#ffffff",
              whiteSpace: "nowrap",
            }}
          >
            {b.word}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * ١١ — الشريط المستمرّ.
 *
 * أطعمةٌ تمرّ بأحجامٍ مختلفة: كبيرةٌ جداً، وأصغر، ونصفُ ظاهرة — فلا يبدو شريط
 * صورٍ متساوية. القائمة مكرّرة مرّتين والإزاحة `-50%` بالضبط، فيعود إلى نقطة
 * البداية بلا قفزة: نفس حيلة `st-drift` القائمة في `globals.css`.
 */
const STRIP = [
  { img: "burger-whole.webp", h: "86vh" },
  { img: "rizo.webp", h: "54vh" },
  { img: "chicken.webp", h: "72vh" },
  { img: "burger-4.webp", h: "78vh" },
  { img: "rice.webp", h: "38vh" },
  { img: "burger-6.webp", h: "44vh" },
];

function SceneStrip() {
  const line = [...STRIP, ...STRIP];
  return (
    <div className="wall-scene" style={{ overflow: "hidden" }}>
      <div
        className="wall-anim"
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          display: "flex",
          alignItems: "center",
          gap: "12vh",
          width: "max-content",
          marginTop: "-44vh",
          animationName: "wall-strip",
        }}
      >
        {line.map((it, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${it.img}-${i}`} src={`/wallimg/${it.img}`} alt="" style={{ height: it.h, width: "auto", flexShrink: 0 }} />
        ))}
      </div>
    </div>
  );
}

/** صنفٌ يعبر الجدار */
function Food({ src, anim, size, y }: { src: string; anim: string; size: string; y: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="wall-anim"
      src={`/wallimg/${src}`}
      alt=""
      style={{ position: "absolute", left: 0, top: y, height: size, width: "auto", animationName: anim }}
    />
  );
}

/** سطرٌ فيه كلمةٌ مميَّزة أكبر */
function Line({ anim, y, text, accent }: { anim: string; y: string; text: string; accent: string }) {
  const [before, after] = text.split(accent);
  return (
    <span
      className="wall-anim wall-display"
      style={{ position: "absolute", left: MID, top: y, fontSize: H1, display: "block", animationName: anim }}
    >
      {before}
      <span className="wall-stamp" style={{ fontSize: "1.5em" }}>{accent}</span>
      {after}
    </span>
  );
}

/** نجمةٌ من زينة الملصق */
function Star({ x, y, size }: { x: string; y: string; size: string }) {
  return (
    <span
      aria-hidden
      className="wall-anim wall-star"
      style={{ left: x, top: y, width: size, height: size, animationName: "wall-twinkle" }}
    />
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
