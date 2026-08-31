// Puts the waiting-room posters in public/posters/ and repoints display_ads.
//
// TWO findings, both measured on the shop's television with a diagnostic page
// rather than guessed at:
//
// 1. Supabase storage sits behind Cloudflare and answers with a Set-Cookie
//    scoped to supabase.co — on a request to our own host — plus an Alt-Svc
//    invitation to HTTP/3. That set drops the response. Files Netlify serves
//    carry neither header and render fine.
//
// 2. The directory may not be called "ads". The set's browser has ad filtering
//    built in, and `/ads/` is matched by every filter list there is. A poster at
//    /ads/1.jpg was blocked; the identical image at /check/big.jpg — larger —
//    loaded. That one word cost most of a day: it also explains why the very
//    first path, /img/ads/1.jpg, never worked, and why moving it to
//    /img/ads/tv/ did not help either.
//
// Hence /posters/. Do not rename it back.
//
//   node scripts/ads-to-static.mjs
import sharp from "sharp";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

mkdirSync("public/posters", { recursive: true });

const ads = await (await fetch(`${BASE}/rest/v1/display_ads?select=id,image_url,sort&order=sort`, { headers: H })).json();

for (const ad of ads) {
  const name = ad.image_url.split("/").pop().replace(/\.[a-z]+$/i, "") + ".jpg";
  const target = `/posters/${name}`;
  if (ad.image_url === target) {
    console.log(`· ${target} — already local`);
    continue;
  }

  // a local /ads/ path has no bytes to fetch over the network — read the file
  const src = ad.image_url.startsWith("/")
    ? readFileSync(`public/posters/${name}`)
    : Buffer.from(await (await fetch(ad.image_url)).arrayBuffer());

  const out = await sharp(src)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: false })
    .toBuffer();
  writeFileSync(`public/posters/${name}`, out);

  const res = await fetch(`${BASE}/rest/v1/display_ads?id=eq.${ad.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: target }),
  });
  console.log(`${res.ok ? "✓" : "✗"} ${target}  ${(out.length / 1024).toFixed(0)}KB`);
}
