// Start Station as the shop hub.
//
// `next build` here produces a standalone server (see next.config.ts), and a
// standalone build does NOT include the static assets — Next expects whoever
// deploys it to copy them in. On a managed host the platform does that; in a
// restaurant there is nobody to do it, and the symptom is a menu that loads
// with no styles and no photos twenty minutes before opening.
//
//   node scripts/hub-start.mjs [port]
//
// Sets STATION_HUB=1 itself, because a hub started without it is just a slower
// copy of the website and nobody would notice until the line went down.
import { cpSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");
const server = join(standalone, "server.js");

if (!existsSync(server)) {
  console.error("لا يوجد بناء. شغّل أولاً:  npm run build");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
}

// The standalone server runs with its own directory as cwd, so Next looks for
// .env.local THERE and finds nothing. Without this the hub starts, serves
// pages, and quietly cannot reach Supabase at all — which looks exactly like
// the outage it is supposed to survive.
const envText = readFileSync(join(root, ".env.local"), "utf8");
for (const m of envText.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm)) {
  if (process.env[m[1]] !== undefined) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ينقص SUPABASE_SERVICE_ROLE_KEY في .env.local — الهَب لا يستطيع الرفع بدونه.");
  process.exit(1);
}

const port = process.argv[2] || process.env.PORT || "3000";
console.log(`ستيشن هَب — http://0.0.0.0:${port}`);

spawn(process.execPath, [server], {
  cwd: standalone,
  stdio: "inherit",
  env: {
    ...process.env,
    STATION_HUB: "1",
    PORT: port,
    // listen on the LAN, not just loopback: every screen in the shop is a
    // different device
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    // the local database belongs to the repo folder, not the standalone copy,
    // so a rebuild never wipes the day's orders
    STATION_HUB_DB: process.env.STATION_HUB_DB || join(root, ".hub", "station.db"),
  },
}).on("exit", (code) => process.exit(code ?? 0));
