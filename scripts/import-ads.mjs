// Uploads waiting-area TV adverts to the Supabase `menu` bucket and registers
// them in display_ads.
//
//   node scripts/import-ads.mjs ../ADS
//   node scripts/import-ads.mjs ../ADS --replace   (clear the existing set first)
//
// Re-runnable: an image with the same filename overwrites in place and updates
// its row rather than piling up duplicates.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";
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
const replace = process.argv.includes("--replace");
if (!dir) {
  console.error("usage: node scripts/import-ads.mjs <folder-with-images> [--replace]");
  process.exit(1);
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const files = readdirSync(dir)
  .filter((f) => MIME[extname(f).toLowerCase()] && statSync(join(dir, f)).isFile())
  // 1.jpg before 10.jpg — plain sort would not
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!files.length) {
  console.error(`✗ no images in ${dir}`);
  process.exit(1);
}

if (replace) {
  await supabase.from("display_ads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("· cleared existing ads");
}

let n = 0;
for (const [i, file] of files.entries()) {
  const ext = extname(file).toLowerCase();
  const path = `ads/${basename(file, ext)}${ext}`;
  const body = readFileSync(join(dir, file));

  const { error: upErr } = await supabase.storage.from("menu").upload(path, body, {
    contentType: MIME[ext],
    upsert: true,
    cacheControl: "3600",
  });
  if (upErr) {
    console.error(`✗ ${file}: ${upErr.message}`);
    continue;
  }

  const { data: pub } = supabase.storage.from("menu").getPublicUrl(path);
  const url = pub.publicUrl;

  const { data: existing } = await supabase.from("display_ads").select("id").eq("image_url", url).maybeSingle();
  if (existing) {
    await supabase.from("display_ads").update({ sort: i + 1, is_active: true }).eq("id", existing.id);
  } else {
    const { error } = await supabase.from("display_ads").insert({ image_url: url, sort: i + 1, title: basename(file, ext) });
    if (error) {
      console.error(`✗ ${file}: ${error.message}`);
      continue;
    }
  }
  console.log(`✓ ${file}`);
  n++;
}

console.log(`\n${n}/${files.length} ads ready — they show on /queue whenever no order is in progress.`);
