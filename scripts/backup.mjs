// نسخة احتياطية لحظية — a full snapshot of the database, on demand or on a timer.
//
//   node scripts/backup.mjs                    snapshot → .backups/
//   node scripts/backup.mjs --out D:/nusakh    somewhere else (a USB stick, a NAS)
//   node scripts/backup.mjs --list             what we have
//   node scripts/backup.mjs --restore <file>   put it all back
//   node scripts/backup.mjs --restore <file> --only delivery_partners
//
// ── why not just trust Supabase ───────────────────────────────────────────
// The free plan has no daily backup at all, and even a paid one only rolls
// back the whole project to a point the platform chose. This writes a file we
// hold: it can sit on the shop's own hub, on a USB stick in a drawer, or both.
// A backup that lives only inside the thing it is backing up is a wish.
//
// ── what is inside ────────────────────────────────────────────────────────
// Every row of every table in `public`, as gzipped JSON. Not pg_dump: that
// needs a matching client binary on the machine, and the one thing a backup
// must never do is fail on the night you need it because a tool was missing.
//
// NOT included: the product photos in Storage. They are ~7 MB, they change
// about never, and the originals are in ADS/ and in git. Copy the bucket by
// hand if you ever move host.

import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? true;
};
const OUT = flag("--out") || join(root, ".backups");

/* Retention. Keep every snapshot from the last two days — that is the window
   in which someone realises they deleted the wrong thing — then one per day
   for a month. Anything older is a business record, not a backup. */
const KEEP_ALL_HOURS = 48;
const KEEP_DAILY_DAYS = 30;

const connect = async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL غير موجود في .env.local");
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

const stamp = (d) => d.toISOString().replace(/[:.]/g, "-").slice(0, 19);

async function snapshot() {
  const c = await connect();
  const started = new Date();
  try {
    const { rows: tables } = await c.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );

    // One transaction, one repeatable-read view of the whole database. Without
    // it a snapshot taken mid-rush could hold an order whose items were written
    // a moment later — a backup that restores an order with nothing in it.
    await c.query("begin isolation level repeatable read");

    const data = {};
    let rows = 0;
    for (const { table_name } of tables) {
      const r = await c.query(`select * from public."${table_name}"`);
      data[table_name] = r.rows;
      rows += r.rows.length;
    }
    await c.query("commit");

    const payload = {
      station_backup: 1,
      taken_at: started.toISOString(),
      postgres: (await c.query("show server_version")).rows[0].server_version,
      tables: Object.keys(data).length,
      rows,
      data,
    };

    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, `station-${stamp(started)}.json.gz`);
    const gz = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
    writeFileSync(file, gz);

    console.log(`✓ ${file}`);
    console.log(`  ${payload.tables} جدول · ${rows} سجل · ${(gz.length / 1024).toFixed(0)} كيلوبايت`);
    prune();
    return file;
  } finally {
    await c.end();
  }
}

function snapshots() {
  try {
    return readdirSync(OUT)
      .filter((f) => f.startsWith("station-") && f.endsWith(".json.gz"))
      .map((f) => ({ f, path: join(OUT, f), at: statSync(join(OUT, f)).mtime }))
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

function prune() {
  const now = Date.now();
  const keptDays = new Set();
  let removed = 0;
  for (const s of snapshots()) {
    const ageH = (now - s.at) / 3_600_000;
    if (ageH <= KEEP_ALL_HOURS) continue;
    const day = s.at.toISOString().slice(0, 10);
    if (ageH / 24 <= KEEP_DAILY_DAYS && !keptDays.has(day)) {
      keptDays.add(day); // the newest snapshot of that day survives
      continue;
    }
    unlinkSync(s.path);
    removed++;
  }
  if (removed) console.log(`  حُذفت ${removed} نسخة قديمة`);
}

function list() {
  const all = snapshots();
  if (!all.length) return console.log("لا توجد نسخ بعد.");
  for (const s of all) {
    console.log(`${s.f}  ${(statSync(s.path).size / 1024).toFixed(0)}KB  ${s.at.toISOString().slice(0, 16).replace("T", " ")}`);
  }
  console.log(`\n${all.length} نسخة في ${OUT}`);
}

async function restore(file, only) {
  const payload = JSON.parse(gunzipSync(readFileSync(file)).toString());
  if (payload.station_backup !== 1) throw new Error("هذا الملف ليس نسخة ستيشن.");

  const names = only ? [only] : Object.keys(payload.data);
  const c = await connect();
  try {
    await c.query("begin");
    // Turn off triggers and foreign keys for the load. The alternative is
    // working out a safe table order, which is the same thing done worse:
    // the snapshot was consistent when it was taken, so the constraints were
    // satisfied then and will be satisfied again once every table is in.
    await c.query("set session_replication_role = replica");

    let total = 0;
    for (const t of names) {
      const rows = payload.data[t];
      if (!rows) throw new Error(`الجدول «${t}» غير موجود في هذه النسخة.`);
      await c.query(`delete from public."${t}"`);
      for (const row of rows) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const ph = cols.map((_, i) => `$${i + 1}`).join(",");
        await c.query(
          `insert into public."${t}" (${cols.map((k) => `"${k}"`).join(",")}) values (${ph})`,
          cols.map((k) => row[k]),
        );
      }
      total += rows.length;
      console.log(`  ← ${t}: ${rows.length}`);
    }

    await c.query("set session_replication_role = default");
    await c.query("commit");
    console.log(`✓ استُرجع ${total} سجل من ${names.length} جدول (${payload.taken_at})`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    // all or nothing: a half-restored database is worse than the broken one,
    // because now nobody knows which half is which
    throw e;
  } finally {
    await c.end();
  }
}

const restoreFile = flag("--restore");
if (args.includes("--list")) list();
else if (restoreFile && restoreFile !== true) await restore(restoreFile, flag("--only") || null);
else if (restoreFile === true) console.error("حدد الملف: --restore <path>");
else await snapshot();
