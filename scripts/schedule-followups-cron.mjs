// يجدول (أو يعيد جدولة) متابعة ما بعد التسليم: pg_cron ينادي /api/bot/followups
// كل خمس دقائق فيسأل زبائن البوت «قيّم تجربتك» بعد ٤٠ دقيقة من «سلّم للسائق».
// الرابط نتلفاي لأن توكن واتساب هناك. الأسرار من .env.local وقت التشغيل.
// Run: node scripts/schedule-followups-cron.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/).map((l) => l.match(/^([A-Za-z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
for (const k of ["SUPABASE_DB_URL", "STATION_WEBHOOK_SECRET"]) {
  if (!env[k]) { console.error(`${k} missing in .env.local`); process.exit(1); }
}
const SITE = process.env.FOLLOWUPS_SITE ?? "https://station-anbar.netlify.app";

const sql = `
do $do$ begin perform cron.unschedule('station-followups'); exception when others then null; end $do$;
select cron.schedule(
  'station-followups',
  '*/5 * * * *',
  $job$select net.http_post(
    url := '${SITE}/api/bot/followups',
    headers := '{"x-job-secret": "${env.STATION_WEBHOOK_SECRET}", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )$job$
);`;

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(sql);
const jobs = await c.query("select jobname, schedule, active from cron.job");
console.log("✓ cron jobs:", JSON.stringify(jobs.rows));
await c.end();
