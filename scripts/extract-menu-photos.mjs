// Extract the real product photos out of Station's printed menu boards and
// publish them as menu item images.
//
//   node scripts/extract-menu-photos.mjs ../ADS
//   node scripts/extract-menu-photos.mjs ../ADS --dry    (crop only, no upload)
//
// WHY THIS AND NOT GENERATED ART: the boards contain photographs of the shop's
// actual food. Anything synthesised would show a burger that is not the burger
// the customer receives — the fastest way to make a menu feel dishonest.
//
// The crops are then treated so they sit in the Station identity rather than
// the old dark board: a gentle lift in brightness and warmth, a square 1:1
// frame, and webp at two sizes because TabletMenuClient asks for `-sm.webp`
// first and falls back to the full file (see imgSrcs there).
//
// Sauces are deliberately NOT extracted: their thumbnails on the board are
// ~50px circles, and upscaling those to a product tile looks worse than the
// line-art sauce icon MenuIcon already draws.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const dir = process.argv[2];
const dry = process.argv.includes("--dry");
if (!dir) {
  console.error("usage: node scripts/extract-menu-photos.mjs <folder-with-m1.jpg-and-m2.jpg> [--dry]");
  process.exit(1);
}

/* ── where each product sits on each board ──────────────────────────────────
   Verified by cropping and eyeballing a contact sheet; the boards are on a
   strict grid, so a column/row origin plus a pitch describes every tile. */

const BOARD_PIZZA = "m1.jpg"; // 1183x843
const BOARD_MAIN = "m2.jpg"; // 1126x802

const COL_L = [39, 164, 289, 414]; // kentucky + fries, left half of m2
const COL_R = [604, 729, 854, 979]; // burger + zinger, right half of m2
const W = 116;

/** [board, x, y, w, h, slug, name_ar] */
const SHOTS = [
  // ── kentucky ──
  ...row(BOARD_MAIN, COL_L, 72, 103, [
    ["kfc-15", "كنتاكي 15 قطعة"],
    ["kfc-8", "كنتاكي 8 قطع"],
    ["kfc-5", "كنتاكي 5 قطع"],
    ["kfc-3", "كنتاكي 3 قطع"],
  ]),
  ...row(BOARD_MAIN, COL_L, 240, 103, [
    ["rizo", "ريزو"],
    ["poppers", "البوبلنز"],
    ["wings", "أجنحة"],
    ["strips-3", "ستربس 3 قطع"],
  ]),
  // ── fries ──
  ...row(BOARD_MAIN, COL_L, 470, 103, [
    ["finger-sauce", "فنكر صوص"],
    ["finger-cheese", "فنكر بالجبن"],
    ["curly", "الكرلي"],
    ["wedges", "الويدجز"],
  ]),
  ...row(BOARD_MAIN, COL_L, 625, 103, [
    ["garlic-bread", "خبز ثوم مع الجبن"],
    ["onion-rings", "بصل مقرمش"],
    ["cheeto-fries", "شيتو جكن فرايز"],
    ["chicken-fries", "جكن فرايز"],
  ]),
  // ── burger ──
  ...row(BOARD_MAIN, COL_R, 72, 112, [
    ["burger-smoky", "برجر سموكي"],
    ["burger-mushroom", "ماشروم برجر"],
    ["burger-classic", "برجر كلاسيك"],
    ["burger-cheese", "برجر بالجبن"],
  ]),
  ...row(BOARD_MAIN, COL_R, 240, 105, [
    ["philly", "فيلي جبز ستيك"],
    ["burger-double", "دبل برجر بالجبن"],
    ["burger-chicken", "برجر دجاج"],
    ["burger-jelly", "برجر جيلي"],
  ]),
  // ── zinger ──
  ...row(BOARD_MAIN, COL_R, 460, 105, [
    ["zinger-mighty", "مايتي زنجر"],
    ["zinger-smoke", "سموك زنجر"],
    ["zinger-buffalo", "زنجر بوفالو"],
    ["zinger-classic", "كلاسيك زنجر"],
  ]),
  // ── pizza (different board, different grid) ──
  ...row(BOARD_PIZZA, [637, 768, 899, 1030], 78, 104, [
    ["pizza-bbq", "بيتزا دجاج الباربيكيو"],
    ["pizza-veggie", "بيتزا فري فيجي"],
    ["pizza-supreme", "بيتزا سوبريم"],
    ["pizza-pepperoni", "بيتزا بروني"],
  ], 110),
  [BOARD_PIZZA, 890, 255, 118, 105, "pizza-grilled", "بيتزا غريلد تشكن"],
  [BOARD_PIZZA, 1026, 255, 118, 105, "pizza-ranch", "بيتزا تشكن رانش"],
  // the metre pizza is shot wide; a square centre-crop would lose the point of it
  [BOARD_PIZZA, 655, 480, 500, 260, "pizza-limo", "بيتزا ليمو 1 متر"],
];

function row(board, xs, y, h, items, w = W) {
  return items.map(([slug, name], i) => [board, xs[i], y, w, h, slug, name]);
}

/* ── crop, treat, encode ─────────────────────────────────────────────────── */

const OUT = join(root, "menu", "station-photos");
mkdirSync(OUT, { recursive: true });

/**
 * One product tile at one size.
 *
 * `modulate` lifts brightness and saturation a little: the boards are shot dark
 * for a black background, and the same crop on a white card reads muddy.
 * `sharpen` recovers detail lost when a ~116px source is scaled up.
 */
async function tile(src, box, size) {
  return sharp(src)
    .extract(box)
    .resize(size, size, { fit: "cover", position: "attention" })
    .modulate({ brightness: 1.08, saturation: 1.12 })
    .sharpen({ sigma: 1 })
    .webp({ quality: 82 })
    .toBuffer();
}

const supabase = dry
  ? null
  : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

let done = 0;
const missing = [];

for (const [board, x, y, w, h, slug, nameAr] of SHOTS) {
  const src = join(dir, board);
  // inset past the board's own hairline frame, which would otherwise show as a
  // dark strip down one edge of the tile
  const INSET = 4;
  const box = { left: x + INSET, top: y + INSET, width: w - INSET * 2, height: h - INSET * 2 };

  const full = await tile(src, box, 800);
  const small = await tile(src, box, 320);
  writeFileSync(join(OUT, `${slug}.webp`), full);
  writeFileSync(join(OUT, `${slug}-sm.webp`), small);

  if (dry) {
    console.log(`· ${slug.padEnd(18)} ${nameAr}`);
    done++;
    continue;
  }

  const path = `products/${slug}.webp`;
  const up = await Promise.all([
    supabase.storage.from("menu").upload(path, full, { contentType: "image/webp", upsert: true, cacheControl: "3600" }),
    supabase.storage
      .from("menu")
      .upload(`products/${slug}-sm.webp`, small, { contentType: "image/webp", upsert: true, cacheControl: "3600" }),
  ]);
  const failed = up.find((r) => r.error);
  if (failed) {
    console.error(`✗ ${slug}: ${failed.error.message}`);
    continue;
  }

  const { data: pub } = supabase.storage.from("menu").getPublicUrl(path);
  const { error, count } = await supabase
    .from("menu_items")
    .update({ image_url: pub.publicUrl }, { count: "exact" })
    .eq("name_ar", nameAr)
    .eq("is_active", true);

  if (error) {
    console.error(`✗ ${slug}: ${error.message}`);
  } else if (!count) {
    // the crop is fine, the menu simply has no item by that exact name
    missing.push(nameAr);
    console.log(`? ${slug.padEnd(18)} uploaded, but no menu item named «${nameAr}»`);
  } else {
    console.log(`✓ ${slug.padEnd(18)} ${nameAr}`);
    done++;
  }
}

console.log(`\n${done}/${SHOTS.length} photos ${dry ? "cropped" : "published"} → ${OUT}`);
if (missing.length) console.log(`unmatched menu names: ${missing.join(", ")}`);
if (!dry) console.log("sauces keep their line-art icon on purpose — the board thumbnails are too small to upscale.");
