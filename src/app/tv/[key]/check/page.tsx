import { canViewQueue, listDisplayAds } from "@/lib/cafe/queue-actions";

/**
 * /tv/<key>/check — one photograph tells us which layer is broken.
 *
 * The waiting-room posters would not appear on the shop's television and I had
 * spent several rounds guessing at why: cascade layers, dvh units, progressive
 * JPEG, nine images at once. Each guess cost the owner a trip to the screen and
 * told me one bit at a time.
 *
 * This page tests every layer separately, each labelled, on one screen. The
 * owner photographs it once and the answer is in the photo: whichever rows are
 * blank name the failure exactly.
 *
 * Deliberately written with inline styles and no framework classes — it has to
 * render on the browser that could not render the real page, and a test that
 * depends on the thing being tested proves nothing.
 */
export const dynamic = "force-dynamic";

const PX = { border: "2px solid #fff", background: "#fff2", width: 220, height: 150, objectFit: "contain" } as const;

export default async function TvCheckPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!(await canViewQueue(key))) return <p style={{ padding: 40, fontSize: 32 }}>مفتاح غير صحيح</p>;

  const ads = await listDisplayAds(key).catch(() => []);
  const adSrc = ads[0]?.src ?? null;

  // 1x1 red GIF — the smallest possible proof that <img> renders at all, with
  // no network involved whatsoever
  const dataUri =
    "data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  // A 48x48 baseline JPEG, inlined. Round one proved PNG renders and JPEG does
  // not; this asks whether the JPEG DECODER works at all, with no network in
  // the way, and the three files beside it ask where the size limit falls.
  const tinyJpeg = "data:image/jpeg;base64,/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwADADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AhATmNAAAAAAAAAAAAAAAAf/Z";

  return (
    <div dir="rtl" style={{ background: "#ff6b00", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <p style={{ fontSize: 34, fontWeight: 900, margin: "0 0 6px" }}>فحص الشاشة</p>
      <p style={{ fontSize: 20, margin: "0 0 20px" }}>صوّر هذه الصفحة وأرسلها. المربّع الفارغ هو العطل.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <Cell n="١" label="CSS — يجب أن يكون أخضر">
          <div style={{ ...PX, background: "#16a34a" }} />
        </Cell>

        <Cell n="٢" label="SVG">
          <svg width="220" height="150" viewBox="0 0 220 150" style={{ border: "2px solid #fff" }}>
            <circle cx="110" cy="75" r="55" fill="#fff" />
          </svg>
        </Cell>

        <Cell n="٣" label="صورة مدمجة (بلا شبكة)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri} alt="" style={PX} />
        </Cell>

        <Cell n="٤" label="PNG من الموقع نفسه">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" style={PX} />
        </Cell>

        <Cell n="٥" label="الملصق من موقعنا">
          {adSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={adSrc} alt="" style={PX} />
          ) : (
            <div style={{ ...PX, display: "grid", placeItems: "center" }}>لا إعلانات</div>
          )}
        </Cell>

        {/* Fixed at a storage URL on purpose: the posters have since moved to
            our own origin, and this cell has to keep answering the question it
            was added for — does anything from Supabase storage render here? */}
        <Cell n="٦" label="JPEG من التخزين مباشرة">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://ahrxdwvxbykdktyclzdi.supabase.co/storage/v1/object/public/menu/ads/tv/1.jpg" alt="" style={PX} />
        </Cell>

        <Cell n="٧" label="JPEG مدمجة (بلا شبكة)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tinyJpeg} alt="" style={PX} />
        </Cell>

        <Cell n="٨" label="JPEG صغيرة (٣٠٠ بكسل)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/check/small.jpg" alt="" style={PX} />
        </Cell>

        <Cell n="٩" label="JPEG متوسطة (٧٠٠ بكسل)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/check/mid.jpg" alt="" style={PX} />
        </Cell>

        <Cell n="١٠" label="JPEG كبيرة (١٢٠٠ بكسل)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/check/big.jpg" alt="" style={PX} />
        </Cell>

        {/* The same bytes as cell 10 under a path containing "ads". If this one
            alone is blank, the browser is filtering by URL — which is what the
            shop's television turned out to be doing, and what cost most of a
            day of looking at image formats instead. Worth keeping: the next
            screen installed here can be checked for it in one glance. */}
        <Cell n="١١" label="نفس الصورة على مسار فيه ads">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ads/probe.jpg" alt="" style={PX} />
        </Cell>

        {/* Cell 6 tested Supabase storage through a path containing "ads", so
            its failure proved nothing about storage — the filter would have
            blocked it either way. This is the same file in storage under a
            clean path. If it renders, posters can be uploaded from inside the
            system again instead of needing a deploy. */}
        <Cell n="١٢" label="من التخزين بمسار نظيف">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/posters/probe.jpg" alt="" style={PX} />
        </Cell>
      </div>

      <p style={{ fontSize: 18, marginTop: 22, opacity: 0.9 }} dir="ltr">
        {adSrc ?? "—"}
      </p>
    </div>
  );
}

function Cell({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center" }}>
      {children}
      <p style={{ fontSize: 19, fontWeight: 700, marginTop: 6 }}>
        {n} — {label}
      </p>
    </div>
  );
}
