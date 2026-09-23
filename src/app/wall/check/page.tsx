/**
 * /wall/check — صورةٌ واحدة تقول أيُّ طبقةٍ تعمل على هذا التلفزيون.
 *
 * قبل بناء أحد عشر مشهداً على جهازٍ قد لا يشغّلها. المالك يفتح هذه الصفحة على
 * شاشةٍ واحدة، **ينتظر دقيقتين بلا لمس**، ثم يصوّرها — والمربّع الواقف يسمّي
 * العطل بالضبط.
 *
 * النمط نفسه الذي أنقذنا مع تلفزيون الاستلام (`/tv/[key]/check`)، وللسبب
 * نفسه: كل تخمينٍ خاطئ كان يكلّف رحلةً إلى الشاشة ويردّ معلومةً واحدة.
 *
 * ومكتوبةٌ بأنماطٍ مضمّنة بلا أصناف ولا خطوط خارجية عمداً: اختبارٌ يعتمد على
 * ما يختبره لا يثبت شيئاً. وهذا بالذات هو سبب وجودها — لا `dvh` ولا
 * `color-mix` ولا `inset` المختصرة، فكلّها غائبة عن Chromium ٨٧.
 */
export const dynamic = "force-dynamic";

const BOX = { border: "2px solid #fff", background: "rgba(255,255,255,0.13)", width: 230, height: 150 } as const;

export default function WallCheckPage() {
  return (
    <div dir="rtl" style={{ background: "#ff6b00", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <p style={{ fontSize: 34, fontWeight: 900, margin: "0 0 4px" }}>فحص جدار الشاشات</p>
      <p style={{ fontSize: 20, margin: "0 0 6px" }}>انتظر دقيقتين بلا لمس، ثم صوّر هذه الصفحة وأرسلها.</p>
      <p style={{ fontSize: 20, margin: "0 0 20px", color: "#2c1e16", fontWeight: 900 }}>المربّع الواقف أو الفارغ هو العطل.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        {/* الأخطر: إن وقف هذا بعد دقيقتين فالمتصفّح يعلّق الحركة على صفحة لا
            يلمسها أحد — وهو تعريف جدار العرض — ولا مفرّ من فيديو أو ميني PC */}
        <Cell n="١" label="حركة مستمرّة — يجب أن يدور دائماً">
          <div style={{ ...BOX, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                top: 45,
                right: 45,
                width: 60,
                height: 60,
                background: "#2c1e16",
                animation: "wallspin 2s linear infinite",
              }}
            />
          </div>
        </Cell>

        {/* عليه يقوم التزامن كلّه: تأخيرٌ سالب يقفز إلى منتصف الدورة، فتتّفق
            الشاشات الأربع مهما تفرّقت أوقات فتحها */}
        <Cell n="٢" label="تأخير سالب — يجب أن يكون داكناً الآن">
          <div style={{ ...BOX, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                background: "#2c1e16",
                animation: "wallhalf 20s steps(1, end) infinite",
                animationDelay: "-10s",
              }}
            />
          </div>
        </Cell>

        <Cell n="٣" label="translate3d — يجب أن ينزلق بنعومة">
          <div style={{ ...BOX, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                top: 55,
                right: 0,
                width: 70,
                height: 40,
                background: "#fff",
                animation: "wallslide 3s ease-in-out infinite alternate",
              }}
            />
          </div>
        </Cell>

        {/* طبقات البركر مقصوصة تتراكب، والشفافية شرط — وJPEG لا يملكها.
            المربّع الأحمر خلف الصورة: إن ظهر الأحمر فالشفافية تعمل */}
        <Cell n="٤" label="WebP بشفافية — يجب أن يظهر الأحمر خلفها">
          <div style={{ ...BOX, background: "#b91c1c", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wallimg/probe-alpha.webp" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        </Cell>

        <Cell n="٥" label="WebP عادية من خادمنا">
          <div style={BOX}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wallimg/probe.webp" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        </Cell>

        {/* لا يُستعمل في المستودع كلّه، وهو أثقل ما يُطلب من سيليكون تلفزيون.
            نتيجته تقرّر هل يكون للمشهد عمقٌ ضبابي أم بالحجم والشفافية وحدهما */}
        <Cell n="٦" label="ضبابية — يجب أن تكون الحافّة ناعمة">
          <div style={{ ...BOX, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                top: 35,
                right: 65,
                width: 100,
                height: 80,
                background: "#2c1e16",
                filter: "blur(12px)",
              }}
            />
          </div>
        </Cell>

        <Cell n="٧" label="clip-path — يجب أن يظهر نصفه">
          <div style={{ ...BOX, position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                background: "#2c1e16",
                clipPath: "inset(0 0 0 50%)",
              }}
            />
          </div>
        </Cell>

        {/* الخطّ العربي الثقيل هو هوية الجدار كلّه */}
        <Cell n="٨" label="الخطّ الثقيل — «المحطة»">
          <div style={{ ...BOX, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 54,
                fontWeight: 900,
                color: "#2c1e16",
                WebkitTextStroke: "3px #ffffff",
                paintOrder: "stroke fill",
              }}
            >
              المحطة
            </span>
          </div>
        </Cell>
      </div>

      {/* الرقم الذي لا أستطيع معرفته إلا من الشاشة نفسها: التلفزيونات تضاعف
          بكسلاتها، فلوحة 1080p قد تقرأ منفذها ٩٦٠ — وكل التصميم بوحدات المنفذ */}
      <div style={{ marginTop: 26, border: "2px solid #fff", padding: 16 }}>
        <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>٩ — قياس الشاشة (يُكتب وحده)</p>
        <div style={{ position: "relative", height: 60, background: "rgba(255,255,255,0.13)", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "50vw", background: "#2c1e16" }} />
          <p style={{ position: "absolute", top: 14, right: 12, margin: 0, fontSize: 26, fontWeight: 900 }}>
            نصف الشاشة بالضبط؟
          </p>
        </div>
        <p id="wall-size" style={{ fontSize: 30, fontWeight: 900, margin: "12px 0 0" }} dir="ltr">
          …
        </p>
      </div>

      {/* الأنماط والسكربت مضمّنان: لا ملفّ خارجي ولا صنف — الصفحة يجب أن تعمل
          على المتصفّح الذي عجز عن الصفحة الحقيقية */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes wallspin { to { transform: rotate(360deg); } }
@keyframes wallhalf { 0% { background: rgba(255,255,255,0.13); } 50% { background: #2c1e16; } }
@keyframes wallslide { from { transform: translate3d(0,0,0); } to { transform: translate3d(-150px,0,0); } }
`,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.getElementById('wall-size').textContent =
            innerWidth+'x'+innerHeight+' css  |  dpr '+(devicePixelRatio||1)+'  |  '+screen.width+'x'+screen.height+' screen';}catch(e){}`,
        }}
      />
    </div>
  );
}

function Cell({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center" }}>
      {children}
      <p style={{ fontSize: 18, fontWeight: 700, marginTop: 6, maxWidth: 230 }}>
        {n} — {label}
      </p>
    </div>
  );
}
