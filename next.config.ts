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
  async rewrites() {
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return supa
      ? [{ source: "/img/:path*", destination: `${supa}/storage/v1/object/public/menu/:path*` }]
      : [];
  },
};

export default nextConfig;
