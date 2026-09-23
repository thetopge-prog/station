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
  "chicken.webp",
  // ملصقات المحل: في أعمدة الأطراف وفي مشهد الصور وفي الشريط. مصغَّرةٌ إلى
  // `wallimg/` — الأصل في `public/posters/` ١٫٤ ميغابايت، وهذه ٣٩٢ كيلوبايت
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `poster-${n}.webp`),
  ...["kentucky", "zinger", "pepperoni", "fries", "onion", "strips", "twister", "rizo-super", "sauce", "sides", "popcorn", "mushroom"].map(
    (n) => `dish-${n}.webp`,
  ),
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
          فيومض مكانها فارغاً كل دورة. والمجموع ٩٧٣ كيلوبايت — دون الميزانية،
          و٢٫٩م هي الحمولة التي سقطت فعلاً على هذا الجهاز من قبل. */}
      {WALL_IMAGES.map((src) => (
        <link key={src} rel="preload" as="image" href={`/wallimg/${src}`} />
      ))}
      <WallCanvas screen={screen} phaseMs={phase} bezel={bezel}>
        <WallScenes />
      </WallCanvas>
      {/* `?debug=1` — مسطرةٌ في الزاوية تُصوَّر من الشاشة نفسها.
          بطاقة الفحص أثبتت أن المتصفّح يشغّل الحركة، والجدار مع ذلك فارغ. فما
          بينهما يُقاس هنا: هل رُسم عنصرٌ ساكن أصلاً؟ وكم يقرأ المنفذ؟ وهل
          تعرف الصفحة حركاتها؟ ثلاثة أسئلةٍ تجيبها صورةٌ واحدة. */}
      {sp.debug || sp.d ? <WallDebug screen={screen} phase={phase} /> : null}
    </>
  );
}

function WallDebug({ screen, phase }: { screen: number; phase: number }) {
  return (
    <div
      dir="ltr"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 99,
        background: "#2c1e16",
        color: "#fff",
        font: "700 22px/1.4 sans-serif",
        padding: "10px 14px",
      }}
    >
      {/* عنصران ساكنان بلا حركة: إن لم يُريا فالمشكلة في الرسم لا في الحركة */}
      <div>
        screen {screen} · phase {phase}ms
      </div>
      <div id="wd" style={{ marginTop: 6 }}>
        …
      </div>
      <div style={{ marginTop: 8, width: 120, height: 26, background: "#ff6b00" }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `try{
            var t0 = Date.now(), p0 = ${JSON.stringify(String(phase))} | 0;
            var kf = 0, sheets = 0;
            for (var i = 0; i < document.styleSheets.length; i++) {
              try {
                var rs = document.styleSheets[i].cssRules; sheets++;
                for (var j = 0; j < rs.length; j++) if (rs[j].type === 7) kf++;
              } catch (x) { /* ملفّ من نطاقٍ آخر */ }
            }
            var cv = document.querySelector('.wall-canvas');
            var r = cv ? cv.getBoundingClientRect() : null;
            // **حيٌّ لا لقطة.** كان يُكتب مرّة عند التحميل، فيصوّره المالك بعد
            // دقائق ويقرأ الطور القديم — ويُشخَّص عطلٌ في لحظةٍ لم تكن هي.
            // الآن يتحرّك، فما في الصورة هو ما على الشاشة حين صُوّرت.
            function tick(){
              var all = document.querySelectorAll('.wall-anim'), vis = 0, here = 0;
              for (var k = 0; k < all.length; k++) {
                if (+getComputedStyle(all[k]).opacity > 0.05) {
                  vis++;
                  var b = all[k].getBoundingClientRect();
                  if (b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight) here++;
                }
              }
              // وأين يقع أوّل عنصرٍ ظاهر فعلاً؟ الحساب يقول داخل الشاشة
              // والمسطرة تقول لا أحد — فليقل الرقم نفسه أين هو
              var w = '-';
              for (var q = 0; q < all.length; q++) {
                if (+getComputedStyle(all[q]).opacity > 0.05) {
                  var bb = all[q].getBoundingClientRect();
                  w = Math.round(bb.left) + ',' + Math.round(bb.top) + ' ' + Math.round(bb.width) + 'x' + Math.round(bb.height);
                  break;
                }
              }
              var ph = (p0 + (Date.now() - t0)) % 140000;
              document.getElementById('wd').textContent =
                innerWidth+'x'+innerHeight+' | kf '+kf+'/'+sheets
                +' | phase '+Math.round(ph/1000)+'s'
                +' | vis '+vis+' على الجدار · '+here+' على هذه الشاشة'
                +' | canvas '+(r? Math.round(r.left)+','+Math.round(r.width)+'x'+Math.round(r.height) : '-')
                +' | first '+w;
            }
            tick(); setInterval(tick, 500);
          }catch(e){ document.getElementById('wd').textContent='JS: '+e.message; }`,
        }}
      />
    </div>
  );
}
