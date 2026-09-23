import type { NextConfig } from "next";

// Managed hosts (Netlify / Vercel) emit their own serverless output, so we must
// NOT produce a standalone server there. The Docker/VPS path (`node server.js`)
// still needs standalone.
const isManagedHost =
  process.env.NETLIFY === "true" || process.env.VERCEL === "1" || process.env.RENDER === "true";

const nextConfig: NextConfig = {
  ...(isManagedHost ? {} : { output: "standalone" }),
  devIndicators: false,
  // Root routing for MODERN_ONLY moved to src/proxy.ts so it can see the session
  // (config redirects run before the proxy and would send logged-in staff who
  // open the bare domain to /menu instead of their dashboard).
  // /img/* → storage (same path the netlify.toml edge proxy serves in prod);
  // this rewrite covers local dev and any Node host.
  // Short links for WhatsApp and printed material. A customer who taps
  // «اطلب توصيل» in a message should land on the menu already set to delivery,
  // not on a chooser that asks a question the link already answered.
  //
  // Config redirects run BEFORE the proxy, so these reach /menu — which is
  // public — without tripping the staff auth gate.
  async redirects() {
    return [
      { source: "/delivery", destination: "/menu?mode=delivery", permanent: false },
      { source: "/pickup", destination: "/menu?mode=pickup", permanent: false },
      { source: "/car", destination: "/menu?mode=curbside", permanent: false },
    ];
  },
  /*
   * صور جدار الإعلان تُخزَّن على الجهاز أسبوعاً.
   *
   * Next يخدم `public/` بـ`max-age=0`، فكل شاشةٍ تسأل عن الواحدة والثلاثين
   * صورة كلّما أعادت التحميل — وهي تُعيدها كل نصف ساعة، على أربعة أجهزة،
   * طول اليوم. الردّ 304 رخيصٌ على خادمنا، لكن متصفّح التلفزيون هو الذي
   * أسقط تسع صورٍ من قبل، ولا داعي لأن يسأل أصلاً.
   *
   * وأسبوعٌ لا أبدية: الاسم لا يحمل بصمةً، فتغييرُ صورةٍ باسمها نفسه يظهر
   * خلال أسبوع. ومن أراد أسرع فليغيّر الاسم.
   */
  async headers() {
    return [
      {
        source: "/wallimg/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
  async rewrites() {
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return supa
      ? [{ source: "/img/:path*", destination: `${supa}/storage/v1/object/public/menu/:path*` }]
      : [];
  },
};

export default nextConfig;
