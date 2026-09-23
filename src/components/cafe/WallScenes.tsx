import type { CSSProperties } from "react";
import { WALL_COPY, WALL_MENU, WALL_SERVICES } from "@/lib/cafe/wall";

/**
 * مشاهد الجدار — ترميزٌ للتصميم لا منطق.
 *
 * كل عنصرٍ هنا له **موضعٌ واحد على اللوحة** بعرض أربع شاشات، ويتحرّك داخلها.
 * لا نسخةَ له في كل شاشة، ولا تسليمَ عند الحدود: الشاشة تُظهر ما يقع في
 * نافذتها من حركةٍ واحدة. وهذا ما لا تستطيعه أربعة فيديوهات منفصلة.
 *
 * والمواضع كلّها **مطلقة بـ`vw` من يسار اللوحة**: `50vw` منتصف الشاشة الأولى،
 * و`200vw` مركز الجدار (حدّ الشاشتين الوسطى، حيث يقف الناظر)، و`400vw` طرفه.
 */

/** مركز الجدار: حدّ الشاشتين ٢ و٣ */
const MID = "200vw";

/** ارتفاع الخطّ الرئيسي — بالارتفاع لا بالعرض، فلا يتضخّم على جدارٍ أعرض */
const H1 = "20vh";

/** منتصف كل شاشة — عليه تُبنى المشاهد التي تعطي كل شاشةٍ محتواها */
const CENTERS = ["50vw", "150vw", "250vw", "350vw"];

export function WallScenes() {
  return (
    <>
      <Backdrop />
      <SceneLockup />
      <SceneSystem />
      <SceneMenu />
      <SceneBurger />
      <SceneRizo />
      <SceneServices />
      <SceneFresh />
      <SceneClean />
      <SceneBoard />
      <SceneStrip />
      {/* السهم آخر شيء فيمرّ فوق الجميع */}
      <Arrow />
    </>
  );
}

/**
 * السهم الرابط بين الشاشات.
 *
 * عنصرٌ واحد يخرج من الشاشة الأولى ويدخل الثانية ثم الثالثة ثم الرابعة عند
 * كل انتقال. وهو ما يجعل العين تقرأ الأربع لوحةً واحدة: الحدّ ليس نهايةَ
 * شيء، بل شيءٌ يعبره أمامك.
 */
function Arrow() {
  return (
    <div className="wall-scene" style={{ pointerEvents: "none" }}>
      <span className="wall-anim wall-arrow" style={{ left: 0, top: "46%", animationName: "wall-arrow" }} />
    </div>
  );
}

/**
 * ٠١ — «المحطة تفزعلك».
 *
 * الاسم والوعد **جنباً إلى جنب**، تكويناً واحداً كما على العلبة. وكان الاسم
 * يُمطّ بتطويلٍ عبر الشاشات الأربع فبدا نشازاً — الحرف الممدود على أربعة
 * أمتار خطٌّ لا كلمة.
 */
function SceneLockup() {
  return (
    <div className="wall-scene">
      <div style={{ ...at(MID), display: "flex", alignItems: "baseline", gap: "3vw", transform: "translateX(-50%)" }}>
        {/* اللوحة `dir="rtl"` فأوّل ابنٍ يقع يميناً — والاسم يُقرأ أولاً */}
        <span className="wall-anim wall-display" style={{ fontSize: H1, animationName: "wall-name" }}>
          {WALL_COPY.name}
        </span>
        <span className="wall-anim wall-stamp" style={{ fontSize: `calc(${H1} * 1.5)`, animationName: "wall-verb" }}>
          {WALL_COPY.verb}
        </span>
      </div>
      <Star x="176vw" y="24%" size="3vh" />
      <Star x="228vw" y="21%" size="3.8vh" />
      <Star x="205vw" y="70%" size="2.4vh" />
    </div>
  );
}

/**
 * ٠٢ — صور المحلّ تملأ الجدار.
 *
 * ثمانِ بطاقاتٍ تدخل من اليسار إلى اليمين فتمتلئ الشاشات الأربع تباعاً.
 * والصور من ملصقات المحلّ نفسه (`public/posters`) لا من مخزونٍ مشترى — وهي
 * الصور الموجودة في المشروع أصلاً.
 */
const POSTERS: (number | string)[] = [1, 2, 3, 4, 5, 6, 7, "m1"];

function SceneSystem() {
  return (
    <div className="wall-scene">
      {POSTERS.map((p, i) => (
        <span
          key={String(p)}
          className="wall-anim"
          style={{
            position: "absolute",
            // ثمانٍ على أربع شاشات: بطاقتان لكل شاشة
            left: `${5 + i * 49}vw`,
            top: "14%",
            width: "44vw",
            height: "72%",
            overflow: "hidden",
            borderRadius: "1.6vh",
            animationName: "wall-card",
            // كلٌّ تدخل بعد التي قبلها. و`animation-delay` محجوزٌ لطور الدورة،
            // فالتتابع يُصنع بمنحنى توقيتٍ مختلف لا بتأخيرٍ ثانٍ
            animationTimingFunction: `cubic-bezier(${(0.2 + i * 0.07).toFixed(2)}, 0.7, 0.3, 1)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/posters/${p}.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </span>
      ))}
    </div>
  );
}

/**
 * ٠٣ — أقسام المنيو مكتوبة.
 *
 * مكتوبةٌ لا مصوَّرة: صورةُ طعامٍ تمرّ بلا اسمٍ تبدو عشوائية، والاسم يقول
 * للواقف ما الذي يُباع هنا. والأقسام هي المفعَّلة نفسها في المنيو.
 */
function SceneMenu() {
  return (
    <div className="wall-scene">
      <span
        className="wall-anim wall-stamp"
        style={{ position: "absolute", left: MID, top: "16%", fontSize: `calc(${H1} * 1.1)`, display: "block", animationName: "wall-menu-title" }}
      >
        {WALL_COPY.menuTitle}
      </span>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "46%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "5vw",
        }}
      >
        {WALL_MENU.map((c, i) => (
          <span
            key={c}
            className="wall-anim wall-display"
            style={{
              fontSize: `calc(${H1} * 0.92)`,
              animationName: "wall-menu-item",
              animationTimingFunction: `cubic-bezier(${(0.15 + i * 0.07).toFixed(2)}, 0.8, 0.25, 1)`,
            }}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * ٠٤ — البركر يتفكّك.
 *
 * يبدأ بركراً كاملاً كما يُقدَّم للزبون، ثم تنفصل طبقاته الستّ وتتباعد عبر
 * الشاشات فيُرى ما بداخله. عكسُ ما يفعله إعلانٌ عادي، ولذلك يُشاهَد.
 *
 * والمدى لكل طبقة في `--lx` و`--ly`، فتتفرّق في جهاتٍ مختلفة بإطارٍ واحد
 * لا ستّة.
 */
/**
 * ترتيب بناء البركر وارتفاع كل طبقة فوق قاعدته.
 *
 * `file` ليس بترتيب أرقام الملفّات: أرقامُ التصدير ليست ترتيبَ الأكل. الترتيب
 * كما يُركَّب في اليد — خبزةٌ سفلى، فالقطعة، فالجبن، فالطماطة، فالخسّ، فالخبزة
 * العليا. والطبقات مقصوصةٌ إلى محتواها في `scripts/wall-assets.mjs`، فارتفاع
 * كلٍّ = العرض ÷ نسبتها، وهذه الأرقام محسوبةٌ منها بتداخلٍ يسير.
 *
 * و`in` لحظةُ نزولها: كلٌّ تنزل بعد التي تحتها، فيُبنى البركر أمام الناظر.
 */
const BURGER_STACK = [
  { file: 1, bottom: 0, at: 0 },
  { file: 4, bottom: 11, at: 1 },
  { file: 2, bottom: 23, at: 2 },
  { file: 3, bottom: 33, at: 3 },
  { file: 5, bottom: 38, at: 4 },
  { file: 6, bottom: 48, at: 5 },
];

function SceneBurger() {
  return (
    <div className="wall-scene">
      {/* البركر كاملاً كما يُقدَّم، ثم يختفي ليُبنى أمامك */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="wall-anim"
        src="/wallimg/burger-whole.webp"
        alt=""
        style={{ position: "absolute", left: MID, top: "50%", width: "78vh", marginTop: "-39vh", animationName: "wall-whole" }}
      />

      {BURGER_STACK.map((l) => (
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
            bottom: `calc(14vh + ${l.bottom}vh)`,
            width: "58vh",
            animationName: "wall-drop",
            // التتابع بمنحنى التوقيت لا بتأخيرٍ ثانٍ — `animation-delay`
            // محجوزٌ لطور الدورة وحده
            animationTimingFunction: `cubic-bezier(${(0.08 + l.at * 0.16).toFixed(2)}, 0.9, 0.35, 1)`,
          }}
        />
      ))}

      {/* الكلام بجانبه — على الشاشة الثانية، فيقرؤه الواقف أمامها */}
      <Aside x="112vw" title={WALL_COPY.burgerTitle} sub={WALL_COPY.burgerSub} />
    </div>
  );
}

/**
 * ٠٥ — الريزو تتطاير منه الحبّات.
 *
 * الطبق في المركز، ومنه تخرج حبّات الرزّ وقطع الدجاج إلى جهاتٍ مختلفة عبر
 * الشاشات. المدى لكل حبّة في متغيّرات، فإطارٌ واحد يخدمها جميعاً.
 */
const GRAINS = [
  { img: "rice.webp", h: "17vh", x: "-58vw", y: "-18vh", r: "-24deg" },
  { img: "chicken.webp", h: "30vh", x: "-34vw", y: "-28vh", r: "18deg" },
  { img: "rice.webp", h: "13vh", x: "-16vw", y: "-34vh", r: "40deg" },
  { img: "chicken.webp", h: "26vh", x: "20vw", y: "-30vh", r: "-30deg" },
  { img: "rice.webp", h: "19vh", x: "44vw", y: "-20vh", r: "12deg" },
  { img: "chicken.webp", h: "28vh", x: "66vw", y: "-6vh", r: "-14deg" },
  { img: "rice.webp", h: "15vh", x: "-70vw", y: "8vh", r: "30deg" },
  { img: "rice.webp", h: "12vh", x: "82vw", y: "12vh", r: "-40deg" },
];

function SceneRizo() {
  return (
    <div className="wall-scene">
      {GRAINS.map((g, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          className="wall-anim"
          src={`/wallimg/${g.img}`}
          alt=""
          style={
            {
              position: "absolute",
              left: MID,
              top: "44%",
              height: g.h,
              width: "auto",
              animationName: "wall-grain",
              animationTimingFunction: `cubic-bezier(${(0.12 + i * 0.05).toFixed(2)}, 0.85, 0.3, 1)`,
              ["--gx"]: g.x,
              ["--gy"]: g.y,
              ["--gr"]: g.r,
            } as CSSProperties
          }
        />
      ))}
      <Aside x="298vw" anim="wall-aside2" title={WALL_COPY.rizoTitle} sub={WALL_COPY.rizoSub} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="wall-anim"
        src="/wallimg/rizo.webp"
        alt=""
        style={{ position: "absolute", left: MID, top: "50%", height: "56vh", marginTop: "-22vh", animationName: "wall-plate" }}
      />
    </div>
  );
}

/**
 * ٠٦ — كيف تطلب.
 *
 * أربع بطاقات، **واحدةٌ لكل شاشة** — فيقرأ الواقف أمام أي شاشةٍ طريقةً كاملة
 * لا نصفَ جملة. وهي أوضاع الاستلام نفسها في النظام، لا وعودٌ على جدار.
 */
function SceneServices() {
  return (
    <div className="wall-scene">
      {WALL_SERVICES.map((s, i) => (
        <div
          key={s.title}
          className="wall-anim"
          style={{
            position: "absolute",
            left: CENTERS[i],
            top: "50%",
            transform: "translateX(-50%)",
            marginTop: "-12vh",
            textAlign: "center",
            animationName: "wall-svc",
            animationTimingFunction: `cubic-bezier(${(0.18 + i * 0.1).toFixed(2)}, 0.8, 0.3, 1)`,
          }}
        >
          <span className="wall-stamp" style={{ display: "block", fontSize: `calc(${H1} * 0.62)` }}>
            {s.title}
          </span>
          <span className="wall-display" style={{ display: "block", marginTop: "2.5vh", fontSize: `calc(${H1} * 0.4)` }}>
            {s.hint}
          </span>
        </div>
      ))}
    </div>
  );
}

/** ٠٧ — «كل شيء طازج / ومن الرمادي» */
function SceneFresh() {
  return (
    <div className="wall-scene">
      <Line anim="wall-fresh1" y={`calc(50% - ${H1} * 1.5)`} text={WALL_COPY.freshTop} accent={WALL_COPY.freshAccentTop} />
      <Line anim="wall-fresh2" y={`calc(50% + ${H1} * 0.5)`} text={WALL_COPY.freshBottom} accent={WALL_COPY.freshAccentBottom} />
    </div>
  );
}

/**
 * ٠٨ — المسح ورسالة النظافة.
 *
 * الجدار كلّه ينقلب إلى فاتحٍ هادئ: الإيقاع يتغيّر تماماً قبل رسالةٍ عن
 * الشفافية، فلا تُقال بلهجة إعلانٍ عن طعام.
 */
function SceneClean() {
  // الخلفية البيضاء يرفعها `Backdrop` صعوداً كالماء — كان هنا مسحٌ أفقي ثانٍ
  // يغطّي عليه، فصار غطاءين على مشهدٍ واحد
  return (
    <div className="wall-scene" style={{ overflow: "hidden" }}>
      <span
        className="wall-anim"
        style={{ ...at(MID), fontSize: `calc(${H1} * 1.3)`, fontWeight: 900, color: "#2c1e16", whiteSpace: "nowrap", animationName: "wall-clean1" }}
      >
        {WALL_COPY.cleanLead}
      </span>
      <span
        className="wall-anim"
        style={{ ...at(MID), fontSize: `calc(${H1} * 0.9)`, fontWeight: 900, color: "#b63f06", whiteSpace: "nowrap", animationName: "wall-clean2" }}
      >
        {WALL_COPY.cleanBody}
      </span>
    </div>
  );
}

/** ٠٩ — اللوحة الرقمية: أربع كتلٍ لونية، واحدةٌ لكل شاشة. ليست شاشة أسعار */
const BOARD = [
  { x: "0vw", bg: "#2c1e16", img: "burger-whole.webp", word: "بركر" },
  { x: "100vw", bg: "#fffdfb", img: "rizo.webp", word: "ريزو" },
  { x: "200vw", bg: "#b63f06", img: "rice.webp", word: "رز" },
  { x: "300vw", bg: "#2c1e16", img: "chicken.webp", word: "كنتاكي" },
];

function SceneBoard() {
  return (
    <div className="wall-scene">
      {BOARD.map((b, i) => (
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
            animationTimingFunction: `cubic-bezier(${(0.2 + i * 0.08).toFixed(2)}, 0.8, 0.3, 1)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/wallimg/${b.img}`}
            alt=""
            // التوسيط بالإزاحة لا بهامشٍ محسوب: هوامش نصف العرض تفترض صورةً
            // مربّعة، والرزّ أعرض من ارتفاعه فكان يعلو عن مركز كتلته
            style={{ position: "absolute", left: "50%", top: "42%", width: "60vh", transform: "translate(-50%, -50%)" }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: "9%",
              transform: "translateX(-50%)",
              fontSize: `calc(${H1} * 0.66)`,
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

/** ١٠ — الشريط المستمرّ بأحجامٍ متفاوتة */
const STRIP = [
  { img: "burger-whole.webp", h: "80vh" },
  { img: "rizo.webp", h: "50vh" },
  { img: "chicken.webp", h: "68vh" },
  { img: "rizo-motion.webp", h: "44vh" },
  { img: "rice.webp", h: "34vh" },
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
          marginTop: "-42vh",
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

/**
 * خلفية الجدار المتحرّكة.
 *
 * البرتقالي وحده ساكن، فيُطعَّم بالأبيض بحركاتٍ واضحة تُرى من بعيد: موجةٌ
 * تتموّج في أسفل الجدار، ثم ماءٌ أبيض يملأ الشاشات صعوداً، ثم يعود البرتقالي
 * صاعداً فوقه. كلّها إزاحةٌ وشفافية — لا مرشّح ولا رسمٌ في كل إطار.
 */
function Backdrop() {
  return (
    <div className="wall-scene" style={{ pointerEvents: "none" }}>
      <span className="wall-anim wall-wave" style={{ bottom: 0, height: "34vh", animationName: "wall-wave" }} />
      <span
        className="wall-anim"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, background: "#fffdfb", animationName: "wall-fill-white" }}
      />
      <span
        className="wall-anim"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, background: "#ff6b00", animationName: "wall-fill-orange" }}
      />
    </div>
  );
}

/** كلامٌ بجانب الطبق — عنوانٌ وسطرٌ تحته */
function Aside({ x, title, sub, anim = "wall-aside" }: { x: string; title: string; sub: string; anim?: string }) {
  return (
    <div
      className="wall-anim"
      style={{
        position: "absolute",
        left: x,
        top: "50%",
        transform: "translateX(-50%)",
        marginTop: "-6vh",
        textAlign: "center",
        animationName: anim,
      }}
    >
      <span className="wall-stamp" style={{ display: "block", fontSize: `calc(${H1} * 0.78)` }}>
        {title}
      </span>
      <span className="wall-display" style={{ display: "block", marginTop: "2.5vh", fontSize: `calc(${H1} * 0.4)` }}>
        {sub}
      </span>
    </div>
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
      <span className="wall-stamp" style={{ fontSize: "1.5em" }}>
        {accent}
      </span>
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
