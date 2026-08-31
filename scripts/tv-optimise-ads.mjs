// Rebuilds the waiting-room posters in the most conservative form a television
// can be asked to decode, and points display_ads at them.
//
// The originals are 1440x1800 PROGRESSIVE JPEGs. Progressive decoding is a
// modern-browser assumption: TV and embedded decoders handle baseline reliably
// and progressive unevenly, and the poster area on a 1080p set is about 800px
// tall, so 1440 across was never needed. Originals are left untouched under
// ads/ — these go to ads/tv/, so this is reversible by restoring the URLs.
//
//   node scripts/tv-optimise-ads.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const ads = await (await fetch(`${URL_BASE}/rest/v1/display_ads?select=id,image_url,sort&order=sort`, { headers: H })).json();

for (const ad of ads) {
  const name = ad.image_url.split("/").pop();
  const src = await (await fetch(ad.image_url)).arrayBuffer();

  const out = await sharp(Buffer.from(src))
    // long side 1200: a 1080p set shows the poster about 800px tall
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    // baseline, not progressive — the whole point
    .jpeg({ quality: 80, progressive: false, mozjpeg: false })
    .toBuffer();

  const path = `menu/ads/tv/${name}`;
  const put = await fetch(`${URL_BASE}/storage/v1/object/${path}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: out,
  });
  if (!put.ok) {
    console.error(`✗ ${name}: ${put.status} ${await put.text()}`);
    continue;
  }

  const newUrl = `${URL_BASE}/storage/v1/object/public/menu/ads/tv/${name}`;
  const patch = await fetch(`${URL_BASE}/rest/v1/display_ads?id=eq.${ad.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: newUrl }),
  });
  const kb = (out.length / 1024).toFixed(0);
  console.log(`${patch.ok ? "✓" : "✗"} ${name}  ${(src.byteLength / 1024).toFixed(0)}KB → ${kb}KB  baseline`);
}
