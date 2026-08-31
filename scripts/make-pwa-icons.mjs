// Generates the PWA / favicon icon set + the UI logo for STATION.
//   Usage: node scripts/make-pwa-icons.mjs
//
// The mark is drawn here as vector, from the same geometry as the on-screen
// component in src/components/cafe/Logo.tsx — the smiley stamped on the boxes,
// cups and fry sleeves.
//
// It is drawn rather than loaded from a bitmap ON PURPOSE. This script used to
// composite public/icons/logo.png, and that file was another client's coffee
// logo inherited when this project was split off. Every icon in the app —
// favicon, home-screen tile, apple-touch, the picture on the customer menu —
// carried that other brand for months, on a customer-facing screen. A bitmap
// dependency is how that happens; geometry in the repo cannot silently be the
// wrong company.

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "icons");
mkdirSync(out, { recursive: true });

/** brand orange — keep in sync with BRAND.themeColor and --primary */
const ORANGE = "#ff6b00";
const CREAM = "#ffffff";

/**
 * The Station smiley on an orange field.
 *
 * `scale` shrinks the mark inside the canvas so a maskable icon survives being
 * cropped to a circle by Android; `radius` rounds the plate for the plain icon.
 * Coordinates are the Logo.tsx 64-unit drawing multiplied by 8.
 */
function markSvg({ radius = 0, scale = 1 } = {}) {
  const t = (512 - 512 * scale) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${ORANGE}"/>
  <g transform="translate(${t} ${t}) scale(${scale})" fill="none" stroke="${CREAM}" stroke-width="32" stroke-linecap="round">
    <circle cx="256" cy="256" r="232"/>
    <path d="M160 200c12.8-27.2 43.2-27.2 56 0"/>
    <path d="M296 200c12.8-27.2 43.2-27.2 56 0"/>
    <path d="M168 312c36.8 49.6 139.2 49.6 176 0"/>
  </g>
</svg>`);
}

const plate = markSvg({ radius: 96, scale: 0.82 });

await sharp(plate).resize(192, 192).png().toFile(join(out, "icon-192.png"));
await sharp(plate).resize(512, 512).png().toFile(join(out, "icon-512.png"));
// maskable: full bleed, mark pulled in so a circular crop never clips the smile
await sharp(markSvg({ radius: 0, scale: 0.66 })).resize(512, 512).png().toFile(join(out, "icon-maskable-512.png"));
await sharp(markSvg({ radius: 0, scale: 0.78 })).resize(180, 180).png().toFile(join(out, "apple-touch-icon.png"));
await sharp(plate).resize(512, 512).png().toFile(join(root, "src", "app", "icon.png"));
await sharp(plate).resize(256, 256).png().toFile(join(out, "logo-ui.png"));

// the picture on the customer menu (ModernMenuClient) and the legacy /logo.png
await sharp(plate).resize(512, 512).png().toFile(join(out, "logo.png"));
await sharp(plate).resize(512, 512).png().toFile(join(root, "public", "logo.png"));

console.log("✓ station icons generated from the vector mark (no inherited bitmap)");
