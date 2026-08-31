// Moves the waiting-room posters out of Supabase storage and into this repo's
// public/ads/, then repoints display_ads at the local paths.
//
// WHY, measured on the shop's actual television rather than guessed:
// a diagnostic page showed CSS, SVG, data-URI images, a PNG from our origin and
// three JPEGs from our origin all rendering — while the same poster, both
// through the /img proxy and straight from storage, stayed blank. The bytes are
// a valid baseline JPEG; the difference is the delivery. Supabase storage sits
// behind Cloudflare and answers with a Set-Cookie for supabase.co (on a request
// to our own host) plus an Alt-Svc invitation to HTTP/3. That set drops the
// response. Files served by Netlify carry neither header, and it renders them.
//
// The trade: a new poster now needs a deploy rather than an upload. For nine
// posters that change a few times a year, on the one screen customers look at,
// that is the right side of the trade.
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

mkdirSync("public/ads", { recursive: true });

const ads = await (await fetch(`${BASE}/rest/v1/display_ads?select=id,image_url,sort&order=sort`, { headers: H })).json();

for (const ad of ads) {
  if (ad.image_url.startsWith("/ads/")) {
    console.log(`· ${ad.image_url} — already local`);
    continue;
  }
  const name = ad.image_url.split("/").pop().replace(/\.[a-z]+$/i, "") + ".jpg";
  const src = await (await fetch(ad.image_url)).arrayBuffer();

  const out = await sharp(Buffer.from(src))
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: false })
    .toBuffer();
  writeFileSync(`public/ads/${name}`, out);

  const res = await fetch(`${BASE}/rest/v1/display_ads?id=eq.${ad.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: `/ads/${name}` }),
  });
  console.log(`${res.ok ? "✓" : "✗"} /ads/${name}  ${(out.length / 1024).toFixed(0)}KB`);
}
