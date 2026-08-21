// Publish the shop's studio product photos as menu images.
//
//   node scripts/import-product-photos.mjs ../ADS/A
//   node scripts/import-product-photos.mjs ../ADS/A --dry   (write locally, no upload)
//
// Supersedes extract-menu-photos.mjs, which cropped tiles out of the printed
// menu boards because that was all we had. These are the real thing: shot on
// the Station orange, in the kraft smiley cups, at ~1250px.
//
// Two rules the mapping follows:
//
//   * A photo is only assigned to a product it actually shows. Selling a
//     mushroom burger with a picture of a philly cheesesteak is the fastest
//     way to make a menu feel dishonest, and the customer finds out at the
//     counter.
//   * Where the shop has no photo yet, a REUSED photo of the closest real
//     product is used rather than leaving a hole, so the menu can be walked
//     end to end during testing. Every reuse is marked ♻ in the output — that
//     list is the shot list for the next studio session.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
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

const SRC = process.argv[2];
const dry = process.argv.includes("--dry");
if (!SRC) {
  console.error("usage: node scripts/import-product-photos.mjs <folder containing pizza/ bur/ kin/ fries/> [--dry]");
  process.exit(1);
}

/* ── mapping ───────────────────────────────────────────────────────────────
   [ slug, exact menu_items.name_ar, source file, reused? ]                  */
const MAP = [
  // بيتزا
  ["pizza-bbq-chicken", "بيتزا دجاج الباربيكيو", "pizza/1.png"],
  ["pizza-supreme", "بيتزا سوبريم", "pizza/2.png"],
  ["pizza-grilled-chicken", "بيتزا غريلد تشكن", "pizza/3.png"],
  ["pizza-peperoni", "بيتزا بروني", "pizza/4.png"],
  ["pizza-veggie", "بيتزا فري فيجي", "pizza/5.png"],
  ["pizza-chicken-ranch", "بيتزا تشكن رانش", "pizza/6.png"],
  ["pizza-metre", "بيتزا ليمو 1 متر", "pizza/1M.png"],

  // برجر — photos 1..5 are beef, 6..9 are chicken
  ["burger-cheese", "برجر بالجبن", "bur/1.png"],
  ["burger-double-cheese", "دبل برجر بالجبن", "bur/2.png"],
  ["burger-classic", "برجر كلاسيك", "bur/3.png"],
  ["burger-mushroom", "ماشروم برجر", "bur/4.png"],
  ["burger-philly", "فيلي جبز ستيك", "bur/5.png"],
  ["burger-chicken", "برجر دجاج", "bur/7.png"],
  ["burger-smoky", "برجر سموكي", "bur/2.png", true],
  ["burger-jelly", "برجر جيلي", "bur/3.png", true],

  // زنجر — the crispy-chicken half of the burger shoot
  ["zinger-classic", "كلاسيك زنجر", "bur/6.png"],
  ["zinger-smoke", "سموك زنجر", "bur/8.png"],
  ["zinger-buffalo", "زنجر بوفالو", "bur/9.png"],
  ["zinger-mighty", "مايتي زنجر", "bur/6.png", true],

  // كنتاكي
  ["kfc-15", "كنتاكي 15 قطعة", "kin/1.png"],
  ["kfc-8", "كنتاكي 8 قطع", "kin/2.png"],
  ["kfc-5", "كنتاكي 5 قطع", "kin/3.png"],
  ["kfc-wings", "أجنحة", "kin/4.png"],
  ["kfc-popcorn", "البوبلنز", "kin/5.png"],
  ["kfc-3", "كنتاكي 3 قطع", "kin/6.png"],
  ["kfc-strips", "ستربس 3 قطع", "kin/7.png"],
  ["kfc-rizo", "ريزو", "kin/8.png"],

  // فرايس
  ["fries-sauce", "فنكر صوص", "fries/1.png"],
  ["fries-curly", "الكرلي", "fries/2.png"],
  ["fries-cheese", "فنكر بالجبن", "fries/3.png"],
  ["onion-rings", "بصل مقرمش", "fries/4.png"],
  ["fries-wedges", "الويدجز", "fries/5.png"],
  ["garlic-bread", "خبز ثوم مع الجبن", "fries/6.png"],
  ["fries-cheeto-chicken", "شيتو جكن فرايز", "fries/8.png"],
  ["fries-chicken", "جكن فرايز", "fries/9.png"],
];

/* Sauces have no photo of their own. Rather than leave seven holes on the
   menu, every one gets the dip cup cropped out of the onion-ring shot — a real
   photograph of the shop's own sauce cup, which is what the customer is
   handed. The same crop is what the free-sauce badge shows on a meal. */
const SAUCES = ["بوفالو", "باربيكيو", "ثوم", "عسل الخردل", "رانش", "جبن", "سويت جيلي"];

/* Not products — assets the menu UI reaches for by fixed name. */
const ASSETS = [
  // «محتويات الوجبة»: the fries + drink that turn a sandwich into a meal.
  // Shot once for burgers and once for chicken; they are the same combo, so
  // one file serves every category that sells a وجبة.
  ["meal", "bur/PF.png"],
  // «التحشية للأطراف» — the stuffed-crust options. Uploaded and ready; no
  // product uses them yet because nobody has told us what the option costs.
  ["crust-1", "pizza/IN1.png"],
  ["crust-2", "pizza/IN2.png"],
  ["crust-3", "pizza/IN3.png"],
];

const OUT = join(root, ".photos");
mkdirSync(OUT, { recursive: true });

const FULL = 1000;
const SMALL = 400;

/** The colour behind the food, sampled rather than guessed — every shoot's
 *  orange is slightly different and a mismatched pad shows as a seam. */
async function background(file) {
  const { data } = await sharp(file).extract({ left: 4, top: 4, width: 8, height: 8 }).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

async function square(file, crop) {
  let img = sharp(file);
  if (crop) img = sharp(await sharp(file).extract(crop).toBuffer());
  const meta = await img.metadata();
  const ratio = meta.width / meta.height;
  // A metre pizza photographed end to end is not square, and `cover` would cut
  // off the ends — which are the entire product. Pad instead.
  const fit = Math.abs(ratio - 1) > 0.1 ? "contain" : "cover";
  // A cut-out (the meal combo) must stay cut out: padding it onto a colour
  // gives it a white card to sit on, and it is meant to float next to a price.
  const bg = fit !== "contain" ? undefined : meta.hasAlpha ? { r: 0, g: 0, b: 0, alpha: 0 } : await background(file);
  const base = img.resize(FULL, FULL, { fit, background: bg });
  return {
    full: await base.clone().webp({ quality: 82 }).toBuffer(),
    small: await base.clone().resize(SMALL, SMALL, { fit, background: bg }).webp({ quality: 78 }).toBuffer(),
  };
}

const supabase = dry
  ? null
  : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

async function publish(slug, buffers) {
  writeFileSync(join(OUT, `${slug}.webp`), buffers.full);
  writeFileSync(join(OUT, `${slug}-sm.webp`), buffers.small);
  if (!supabase) return null;
  const path = `products/${slug}.webp`;
  const [a, b] = await Promise.all([
    supabase.storage.from("menu").upload(path, buffers.full, { contentType: "image/webp", upsert: true, cacheControl: "3600" }),
    supabase.storage
      .from("menu")
      .upload(`products/${slug}-sm.webp`, buffers.small, { contentType: "image/webp", upsert: true, cacheControl: "3600" }),
  ]);
  if (a.error || b.error) throw new Error(`${slug}: ${(a.error || b.error).message}`);
  return supabase.storage.from("menu").getPublicUrl(path).data.publicUrl;
}

async function setImage(nameAr, url) {
  if (!supabase || !url) return 0;
  const { count } = await supabase.from("menu_items").update({ image_url: url }, { count: "exact" }).eq("name_ar", nameAr);
  return count ?? 0;
}

const reused = [];

for (const [slug, nameAr, rel, isReuse] of MAP) {
  const file = join(SRC, rel);
  if (!existsSync(file)) {
    console.log(`✗ ${slug.padEnd(22)} missing source ${rel}`);
    continue;
  }
  const url = await publish(slug, await square(file));
  const n = await setImage(nameAr, url);
  if (isReuse) reused.push(nameAr);
  console.log(`${isReuse ? "♻" : "✓"} ${slug.padEnd(22)} ${rel.padEnd(14)} → «${nameAr}»${n ? "" : dry ? "" : "  ⚠ no matching item"}`);
}

// the dip cup, lifted out of fries/7 — coordinates measured on the 1122×1402
// original; re-measure if that photo is ever reshot
const sauceSrc = join(SRC, "fries/7.png");
if (existsSync(sauceSrc)) {
  const buffers = await square(sauceSrc, { left: 690, top: 770, width: 420, height: 420 });
  const url = await publish("sauce-cup", buffers);
  let hits = 0;
  for (const s of SAUCES) hits += await setImage(s, url);
  console.log(`✓ ${"sauce-cup".padEnd(22)} fries/7.png    → ${SAUCES.length} صوصات${dry ? "" : ` (${hits} updated)`}`);
}

for (const [slug, rel] of ASSETS) {
  const file = join(SRC, rel);
  if (!existsSync(file)) {
    console.log(`✗ ${slug.padEnd(22)} missing source ${rel}`);
    continue;
  }
  await publish(slug, await square(file));
  console.log(`✓ ${slug.padEnd(22)} ${rel.padEnd(14)} → asset (no product)`);
}

console.log(`\nwrote ${OUT}${dry ? "  (dry run — nothing uploaded)" : ""}`);
if (reused.length) {
  console.log(`\n♻ still borrowing another product's photo — shot list for the next session:`);
  for (const n of reused) console.log(`   • ${n}`);
}
