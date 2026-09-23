import type { CSSProperties } from "react";
import { SCREENS, WALL_CLAIM_LEFT, WALL_CLAIM_RIGHT, WALL_COPY, WALL_MENU, WALL_SERVICES } from "@/lib/cafe/wall";

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
      <SceneMosaic set="m" />
      <SceneMenu />
      <SceneBurger />
      <SceneItems />
      <SceneServices />
      <SceneFresh />
      <SceneClean />
      <SceneBoard />
      <SceneStrip />
      <SceneMosaic set="n" />
      <ScenePizza />
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
 * الأصناف تتناثر على الشاشتين الطرفيّتين في المشهد الافتتاحي.
 *
 * «المحطة تفزعلك» تقع في منتصف اللوحة، فالشاشة الأولى والرابعة تبقيان
 * فارغتين وقتَ أهمّ مشهدٍ في العرض. فتطير الأصناف من جهة المنتصف إلى
 * الخارج وتستقرّ متناثرةً عند الطرفين — الاسم في القلب، والطعام حوله.
 *
 * والعشوائية مكتوبةٌ بيد: كل قطعةٍ لها مبدؤها ومستقرّها وميلها ومنحنى
 * توقيتها. ولا `Math.random()` — الشاشات الأربع أربعة أجهزة، ولو اختار كلٌّ
 * منها أرقامه لاختلف الجداران.
 */
const SCATTER = [
  { img: "kentucky", x: "12vw", y: "15%", h: "20vh", sx: "62vw", sy: "-10vh", r: -14 },
  { img: "fries", x: "39vw", y: "9%", h: "16vh", sx: "80vw", sy: "7vh", r: 12 },
  { img: "zinger", x: "7vw", y: "51%", h: "22vh", sx: "96vw", sy: "13vh", r: 9 },
  { img: "onion", x: "35vw", y: "45%", h: "14vh", sx: "70vw", sy: "-15vh", r: -22 },
  { img: "popcorn", x: "63vw", y: "21%", h: "18vh", sx: "54vw", sy: "10vh", r: 16 },
  { img: "pepperoni", x: "341vw", y: "13%", h: "21vh", sx: "-70vw", sy: "8vh", r: 13 },
  { img: "twister", x: "369vw", y: "43%", h: "18vh", sx: "-88vw", sy: "-12vh", r: -16 },
  { img: "strips", x: "314vw", y: "25%", h: "16vh", sx: "-58vw", sy: "-7vh", r: 20 },
  { img: "rizo-super", x: "345vw", y: "61%", h: "17vh", sx: "-76vw", sy: "12vh", r: -9 },
  { img: "mushroom", x: "383vw", y: "17%", h: "15vh", sx: "-62vw", sy: "14vh", r: 11 },
  { img: "sauce", x: "318vw", y: "68%", h: "14vh", sx: "-50vw", sy: "-11vh", r: -18 },
];

function Scatter() {
  return (
    <>
      {SCATTER.map((d, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={d.img}
          className="wall-anim"
          src={`/wallimg/dish-${d.img}.webp`}
          alt=""
          style={
            {
              position: "absolute",
              left: d.x,
              top: d.y,
              height: d.h,
              width: "auto",
              animationName: "wall-scatter",
              animationTimingFunction: `cubic-bezier(${(0.06 + i * 0.045).toFixed(3)}, 0.88, 0.32, 1)`,
              ["--sx"]: d.sx,
              ["--sy"]: d.sy,
              // تبدأ مائلةً أكثر ثم تستقرّ على ميلها — تدحرجٌ قصير لا دوران
              ["--sr"]: `${d.r * 3}deg`,
              ["--er"]: `${d.r}deg`,
            } as CSSProperties
          }
        />
      ))}
    </>
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
      <Scatter />
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
 * صورةٌ واحدة مفكَّكة على الجدار.
 *
 * كل صورةٍ تُقصّ إلى شرائح رأسية — أربع أو خمس أو ست، يختلف العدد بين صورةٍ
 * وأخرى عمداً فلا يقع القصّ دائماً على حدود الشاشات نفسها. وتُوزَّع الشرائح
 * وكلٌّ تُفكَّك على **شاشةٍ واحدة**: صورةٌ مربّعة لا تمتدّ على جدارٍ نسبته
 * أربعةٌ إلى واحد إلّا بتشويه الطعام. وأربعُ صورٍ تُعرض معاً — واحدةٌ لكل
 * شاشة — فالقصّ يُرى، والجدار ممتلئ، والصورة على نسبتها.
 *
 * والعرض يُحسب من نسبة الشريحة نفسها (`ar` = العرض ÷ الارتفاع)، لا برقمٍ
 * واحدٍ لها جميعاً: شريحةٌ من صورةٍ ذات ستّ شرائح أضيق من أختها من صورةٍ ذات
 * أربع، وعرضٌ واحدٌ يمطّ هذه ويضغط تلك.
 */
const MOSAIC: Record<string, { n: number; ar: number }[]> = {
  m: [{ n: 5, ar: 0.36 }, { n: 4, ar: 0.44 }, { n: 6, ar: 0.3 }, { n: 4, ar: 0.44 }, { n: 5, ar: 0.36 }, { n: 6, ar: 0.3 }],
  n: [{ n: 4, ar: 0.44 }, { n: 5, ar: 0.36 }, { n: 6, ar: 0.3 }, { n: 4, ar: 0.44 }, { n: 5, ar: 0.36 }, { n: 6, ar: 0.3 }, { n: 4, ar: 0.44 }],
};

/** ارتفاع الشريحة بـvh، والفجوة بينها وبين أختها */
const MOS_H = 58;
const MOS_GAP = 0.9;

function SceneMosaic({ set }: { set: "m" | "n" }) {
  return (
    <div className="wall-scene">
      {MOSAIC[set].map((img, f) => {
        // عرض الشريحة من نسبتها هي، لا برقمٍ واحدٍ لها جميعاً
        const w = MOS_H * img.ar;
        const span = img.n * w + (img.n - 1) * MOS_GAP;
        // كلٌّ على شاشةٍ بالدور، وأربعٌ معاً في كل لحظة
        const screen = f % SCREENS;
        return Array.from({ length: img.n }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${f}-${i}`}
            className="wall-anim"
            src={`/wallimg/${set}${f}-${i}.webp`}
            alt=""
            style={{
              position: "absolute",
              left: `calc(${CENTERS[screen]} + ${(-span / 2 + i * (w + MOS_GAP) + w / 2).toFixed(2)}vh)`,
              top: "50%",
              marginTop: `-${MOS_H / 2}vh`,
              height: `${MOS_H}vh`,
              width: `${w.toFixed(2)}vh`,
              borderRadius: "0.8vh",
              animationName: `wall-mos-${set}${f}`,
              // الشرائح تتفرّق بمنحنى التوقيت: تصل واحدةً بعد أخرى من اليمين
              animationTimingFunction: `cubic-bezier(${(0.12 + (img.n - 1 - i) * 0.13).toFixed(2)}, 0.85, 0.3, 1)`,
            }}
          />
        ));
      })}
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
      {/* موزَّعةٌ على اللوحة كلّها لا مصفوفةً في المنتصف: صفٌّ واحدٌ في الوسط
          يترك الشاشة الأولى والرابعة فارغتين ويُصغّر الكلمات حتى لا تُقرأ من
          بعيد. وبالتوزيع ينال كل شاشةٍ قسمان بحجمٍ يُقرأ من ثلاثة أمتار */}
      {WALL_MENU.map((c, i) => (
        <span
          key={c}
          className="wall-anim wall-display"
          style={{
            position: "absolute",
            // من اليمين: العربية تُقرأ يميناً، فأوّل قسمٍ على الشاشة الرابعة
            left: `${(((WALL_MENU.length - 0.5 - i) * 400) / WALL_MENU.length).toFixed(2)}vw`,
            top: "46%",
            fontSize: `calc(${H1} * 1)`,
            animationName: "wall-menu-item",
            animationTimingFunction: `cubic-bezier(${(0.15 + i * 0.07).toFixed(2)}, 0.8, 0.25, 1)`,
          }}
        >
          {c}
        </span>
      ))}
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
  { file: 4, bottom: 9.9, at: 1 },
  { file: 2, bottom: 20.6, at: 2 },
  { file: 3, bottom: 29.6, at: 3 },
  { file: 5, bottom: 34.1, at: 4 },
  { file: 6, bottom: 43, at: 5 },
];

function SceneBurger() {
  return (
    <div className="wall-scene">
      {BURGER_STACK.map((l) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={l.file}
          className="wall-anim"
          src={`/wallimg/burger-${l.file}.webp`}
          alt=""
          style={{
            position: "absolute",
            left: CENTERS[1],
            // من أسفل الشاشة لا من وسطها: البركر يُبنى على قاعدةٍ واحدة
            bottom: `calc(20vh + ${l.bottom}vh)`,
            width: "52vh",
            animationName: "wall-drop",
            // التتابع بمنحنى التوقيت لا بتأخيرٍ ثانٍ — `animation-delay`
            // محجوزٌ لطور الدورة وحده
            animationTimingFunction: `cubic-bezier(${(0.08 + l.at * 0.16).toFixed(2)}, 0.9, 0.35, 1)`,
          }}
        />
      ))}

      {/* الكلام بجانبه — على الشاشة الثانية، فيقرؤه الواقف أمامها */}
      {/* واحدٌ على الشاشة الأولى وواحدٌ على الرابعة، والبركر يُبنى بينهما على
          الثانية والثالثة. كانا على ١٠٤ و٢٩٦ — أي على حدّي الشاشتين الوسطى —
          فتبقى الطرفيّتان برتقاليّتين فارغتين عشر ثوانٍ، ومن ينظر إليهما يقول
          «الشاشة لا تعمل». وقد قالها المالك فعلاً وهو ينظر إلى الرابعة. */}
      {/* الكلام كلّه على الشاشة الأولى: الثلاث الباقيات للطعام وحده */}
      <div className="wall-anim" style={{ position: "absolute", left: CENTERS[0], top: "50%", transform: "translate(-50%, -50%)", textAlign: "center", animationName: "wall-aside" }}>
        <span className="wall-stamp" style={{ display: "block", fontSize: `calc(${H1} * 0.7)` }}>
          {WALL_COPY.heroTitle}
        </span>
        <span className="wall-display" style={{ display: "block", marginTop: "3vh", fontSize: `calc(${H1} * 0.4)` }}>
          {WALL_COPY.burgerTitle}
        </span>
        <span className="wall-display" style={{ display: "block", marginTop: "1.4vh", fontSize: `calc(${H1} * 0.4)` }}>
          {WALL_COPY.pizzaTitle}
        </span>
        <span className="wall-display" style={{ display: "block", marginTop: "1.4vh", fontSize: `calc(${H1} * 0.4)` }}>
          {WALL_COPY.kfcTitle}
        </span>
      </div>
    </div>
  );
}

/**
 * ٠٥ — أصناف المنيو بصورها.
 *
 * المشهد الذي قبله يكتب أسماء الأقسام، وهذا يُريها. صفٌّ واحد يعبر اللوحة
 * كلّها — ثلاثة أصنافٍ أمام كل شاشة، فالواقف أمام أيٍّ منها يرى طبقاً كاملاً
 * باسمه لا نصفَ طبق.
 *
 * والصور من موقع المطعم نفسه، مقصوصةً إلى محتواها ومصغَّرة عندنا.
 */
const DISHES = [
  { img: "kentucky", name: "كنتاكي" },
  { img: "zinger", name: "زنجر" },
  { img: "twister", name: "تويستر" },
  { img: "pepperoni", name: "بيتزا ببروني" },
  { img: "mushroom", name: "مشروم جكن" },
  { img: "rizo-super", name: "ريزو سوبر" },
  { img: "strips", name: "ستربس" },
  { img: "popcorn", name: "بوب كورن" },
  { img: "fries", name: "كرسبي فرايز" },
  { img: "onion", name: "حلقات بصل" },
  { img: "sauce", name: "صوصات" },
];

function SceneItems() {
  return (
    <div className="wall-scene">
      <span
        className="wall-anim wall-stamp"
        style={{
          position: "absolute",
          left: MID,
          top: "11vh",
          transform: "translateX(-50%)",
          fontSize: `calc(${H1} * 0.8)`,
          animationName: "wall-aside2",
        }}
      >
        {WALL_COPY.itemsTitle}
      </span>
      {DISHES.map((d, i) => (
        <div
          key={d.img}
          className="wall-anim"
          style={{
            position: "absolute",
            // الصفّ موزّعٌ على اللوحة كلّها: ٤٠٠vw على اثني عشر صنفاً
            left: `${(((DISHES.length - 0.5 - i) * 400) / DISHES.length).toFixed(2)}vw`,
            top: "52%",
            textAlign: "center",
            animationName: "wall-dish",
            animationTimingFunction: `cubic-bezier(${(0.1 + i * 0.05).toFixed(2)}, 0.85, 0.3, 1)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/wallimg/dish-${d.img}.webp`} alt="" style={{ display: "block", height: "30vh", width: "auto", margin: "0 auto" }} />
          <span className="wall-display" style={{ display: "block", marginTop: "2vh", fontSize: `calc(${H1} * 0.34)` }}>
            {d.name}
          </span>
        </div>
      ))}
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
            left: CENTERS[SCREENS - 1 - i],
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

      {/* الشاشتان الطرفيّتان كانتا فارغتين والدعوى كلّها في المنتصف. فتقولان
          من أين يأتي الطعام: الخضار على اليمين واللحم على اليسار */}
      <Claim x="50vw" anim="wall-fresh3" lines={WALL_CLAIM_LEFT} />
      <Claim x="350vw" anim="wall-fresh4" lines={WALL_CLAIM_RIGHT} />
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

      {/* والشاشة الرابعة تحمل الدعوى نفسها بكلمات المالك — كانت الشاشة
          الوحيدة الباقية بلا شيءٍ في هذا المشهد */}
      <span
        className="wall-anim wall-display"
        style={{
          position: "absolute",
          left: "350vw",
          top: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: `calc(${H1} * 0.72)`,
          color: "#b63f06",
          whiteSpace: "nowrap",
          animationName: "wall-invite",
        }}
      >
        {WALL_COPY.cleanHide}
      </span>

      {/* الدعوة على الشاشة الأولى — كانت فارغةً والكلام كلّه في المنتصف.
          والسهم مرسومٌ لا صورةً منزَّلة: شكلٌ هندسيٌّ بحت، فرسمه بالمتّجهات
          أصفى على أي مقاس، وبلا بايتٍ واحدٍ يُحمَّل، وبلا حقوقِ صورةٍ لغيرنا */}
      <div className="wall-anim" style={{ position: "absolute", left: "50vw", top: "50%", transform: "translate(-50%, -50%)", textAlign: "center", animationName: "wall-invite" }}>
        <svg viewBox="0 0 100 100" style={{ display: "block", height: "24vh", width: "24vh", margin: "0 auto" }} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#0b6b3a" />
          <circle cx="50" cy="50" r="41" fill="none" stroke="#ffffff" strokeWidth="5" />
          <path d="M 20 50 L 44 27 L 44 43 L 77 43 L 77 57 L 44 57 L 44 73 Z" fill="#ffffff" />
        </svg>
        <span style={{ display: "block", marginTop: "3.5vh", fontSize: `calc(${H1} * 0.82)`, fontWeight: 900, color: "#b63f06", whiteSpace: "nowrap" }}>
          {WALL_COPY.cleanInvite}
        </span>
      </div>
    </div>
  );
}

/** ٠٩ — اللوحة الرقمية: أربع كتلٍ لونية، واحدةٌ لكل شاشة. ليست شاشة أسعار */
const BOARD: { x: string; bg: string; img: string; word: string }[] = [
  // من اليمين إلى اليسار كما تُقرأ: أوّلها على الشاشة الرابعة
  { x: "300vw", bg: "#2c1e16", img: "burger-whole.webp", word: "بركر" },
  { x: "200vw", bg: "#fffdfb", img: "rizo.webp", word: "ريزو" },
  { x: "100vw", bg: "#b63f06", img: "chicken.webp", word: "كنتاكي" },
  // وآخرها صورةُ المحل نفسه تملأ الكتلة: ثلاثة أصنافٍ ثم المكان الذي تُصنع فيه
  { x: "0vw", bg: "#2c1e16", img: "dish-pepperoni.webp", word: "بيتزا" },
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
            // التوسيط بالإزاحة لا بهامشٍ محسوب: هامشُ نصف العرض يفترض صورةً
            // مربّعة، فما كان أعرض من ارتفاعه يعلو عن مركز كتلته
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
  { img: "burger-whole.webp", h: "64vh" },
  { img: "dish-kentucky.webp", h: "40vh" },
  { img: "dish-pepperoni.webp", h: "44vh" },
  { img: "dish-zinger.webp", h: "36vh" },
  { img: "rizo.webp", h: "52vh" },
  { img: "dish-fries.webp", h: "38vh" },
  { img: "dish-twister.webp", h: "44vh" },
  { img: "dish-mushroom.webp", h: "50vh" },
  { img: "dish-popcorn.webp", h: "40vh" },
  { img: "dish-strips.webp", h: "46vh" },
  { img: "dish-sauce.webp", h: "36vh" },
  { img: "dish-onion.webp", h: "34vh" },
  { img: "dish-mushroom.webp", h: "42vh" },
  { img: "dish-strips.webp", h: "36vh" },
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
          <img
            key={`${it.img}-${i}`}
            src={`/wallimg/${it.img}`}
            alt=""
            style={{ height: it.h, width: "auto", flexShrink: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * الكنتاكي — السطل يقف، والقطع تنزل فيه.
 *
 * عكس البركر والبيتزا: لا تُبنى طبقاتٌ بل تُملأ علبة. فالسطل يدخل أولاً
 * ويثبت، ثم تسقط القطع الأربع فيه واحدةً بعد أخرى، كلٌّ إلى ركنها —
 * فتُقرأ «تُملأ لك الآن» لا «صورة سطلٍ ممتلئ».
 *
 * والقطع مفصولةٌ من صورةٍ واحدة بتتبّع الوصل لا بأرباعٍ عمياء: لم تكن في
 * شبكةٍ منتظمة، والربع الأعمى كان يقصّ قطعةً نصفين.
 */
const KFC = [
  { file: 1, x: -10, y: 2, h: 18, r: -12, at: 0 },
  { file: 2, x: 9, y: 0, h: 16, r: 14, at: 1 },
  { file: 3, x: -2, y: 8, h: 15, r: -6, at: 2 },
  { file: 4, x: 12, y: 7, h: 14, r: 20, at: 3 },
];

function SceneKfc() {
  return (
    <>
      {/* السطل أولاً فتنزل القطع أمامه وتفيض من حافّته */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="wall-anim"
        src="/wallimg/bucket.webp"
        alt=""
        style={{ position: "absolute", left: CENTERS[3], bottom: "14vh", height: "34vh", width: "auto", transform: "translateX(-50%)", animationName: "wall-bucket" }}
      />
      {KFC.map((k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={k.file}
          className="wall-anim"
          src={`/wallimg/kfc-${k.file}.webp`}
          alt=""
          style={
            {
              position: "absolute",
              left: `calc(${CENTERS[3]} + ${k.x}vh)`,
              bottom: `calc(38vh + ${k.y}vh)`,
              height: `${k.h}vh`,
              width: "auto",
              animationName: "wall-fill",
              animationTimingFunction: `cubic-bezier(${(0.1 + k.at * 0.17).toFixed(2)}, 0.9, 0.3, 1)`,
              ["--kr"]: `${k.r}deg`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

/**
 * ١١ — البيتزا تتكوّن طبقةً طبقة.
 *
 * أخت مشهد البركر وبنفس منطقه: كل طبقةٍ تنزل من فوق الشاشة وتستقرّ على
 * أختها، والتتابع بمنحنى التوقيت لا بتأخيرٍ ثانٍ — `animation-delay` محجوزٌ
 * لطور الدورة وحده.
 *
 * والفرق أن البيتزا تُبنى **مسطّحة**: الطبقات لا تتكوّم بل تتراكب، فالإزاحة
 * الرأسية بينها أصغر من البركر بكثير — ما يُظهر الطبقة هو أنها تصل بعد التي
 * تحتها لا أنها أعلى منها.
 *
 * والصور مقصوصةٌ من صورةٍ واحدة أرسلها المالك: ستّ طبقاتٍ فوق بعضها على
 * أبيض، فُصلت بملءٍ من الحواف لا بعتبةِ بياض — والموزاريلا بيضاء، فعتبةٌ
 * عمياء كانت تأكل الجبن.
 */
const PIZZA_STACK = [
  { file: 1, bottom: 0, at: 0 },
  { file: 2, bottom: 3.6, at: 1 },
  { file: 3, bottom: 6.6, at: 2 },
  { file: 4, bottom: 9.2, at: 3 },
  { file: 5, bottom: 11.4, at: 4 },
  { file: 6, bottom: 13.2, at: 5 },
];

function ScenePizza() {
  return (
    <div className="wall-scene">
      <SceneKfc />
      {PIZZA_STACK.map((l) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={l.file}
          className="wall-anim"
          src={`/wallimg/pizza-${l.file}.webp`}
          alt=""
          style={{
            position: "absolute",
            left: CENTERS[2],
            bottom: `calc(30vh + ${l.bottom}vh)`,
            width: "68vh",
            animationName: "wall-slice",
            animationTimingFunction: `cubic-bezier(${(0.08 + l.at * 0.16).toFixed(2)}, 0.9, 0.35, 1)`,
          }}
        />
      ))}

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
      {/* الماء الأبيض والبرتقالي — وكلاهما **يبدأ مزاحاً خارج الشاشة في نمطه
          الخاصّ**، لا في إطار الحركة وحده.

          لوحٌ أبيض يملأ الشاشة `inset: 0`، وما يرفعه عنها هو `transform` في
          أول لقطةٍ من الحركة. فإن لم تعمل الحركة على متصفّح التلفزيون — وهو
          المتصفّح الذي لم يُختبر بعد — بقي اللوح في مكانه الطبيعي: **شاشةٌ
          بيضاء كاملة، طول اليوم**. وهذا بالضبط ما رآه المالك.

          فالإزاحة تُكتب في النمط نفسه: بلا حركةٍ يبقى الجدار برتقالياً ساكناً،
          ومع الحركة تعمل كما صُمّمت. الفشل يُختار وجهه بدل أن يُترك للصدفة. */}
      <span
        className="wall-anim"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: "#fffdfb",
          transform: "translate3d(0, 101%, 0)",
          animationName: "wall-fill-white",
        }}
      />
      <span
        className="wall-anim"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: "#ff6b00",
          transform: "translate3d(0, 101%, 0)",
          animationName: "wall-fill-orange",
        }}
      />
    </div>
  );
}

/** دعوى مسطورةٌ على شاشةٍ طرفية — سطرٌ تحت سطر، أوّلها الأكبر */
function Claim({ x, anim, lines }: { x: string; anim: string; lines: readonly string[] }) {
  return (
    <div
      className="wall-anim"
      style={{
        position: "absolute",
        left: x,
        top: "50%",
        transform: "translate(-50%, -50%)",
        textAlign: "center",
        animationName: anim,
      }}
    >
      {lines.map((t, i) => (
        <span
          key={t}
          className="wall-display"
          // السطر الأول أكبر، وكلّها تسع الشاشة: «لحومنا عراقية طازجة ١٠٠٪»
          // أربعةٌ وعشرون حرفاً، وبحجمٍ أكبر تخرج من حافّة الشاشة الأولى
          style={{ display: "block", marginTop: i === 0 ? 0 : "2.4vh", fontSize: `calc(${H1} * ${i === 0 ? 0.5 : 0.36})` }}
        >
          {t}
        </span>
      ))}
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
      <span className="wall-stamp" style={{ display: "block", fontSize: `calc(${H1} * 0.62)` }}>
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
