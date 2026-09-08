// نقل المحل من سيدني إلى فرانكفورت — نسخ لا حذف.
//
// القاعدة القديمة تُقرأ فقط. الجديدة تُبنى بالترحيلات نفسها ثم تُملأ صفّاً صفّاً
// بالمعرّفات نفسها (حسابات الموظفين ضمنها، بكلمات سرّها المشفّرة) والصور عبر
// واجهة التخزين. في النهاية عدٌّ بعدّ: أي جدول لا يتطابق يُطبع بالأحمر.
//
//   node scripts/migrate-eu.mjs schema   — الترحيلات على الجديدة (يُكرَّر بلا ضرر)
//   node scripts/migrate-eu.mjs data     — نسخ الجداول (على قاعدة جديدة فارغة)
//   node scripts/migrate-eu.mjs storage  — نسخ الصور
//   node scripts/migrate-eu.mjs verify   — عدّ قديم/جديد
//
// يقرأ من .env.local: SUPABASE_DB_URL (القديمة) و EU_SUPABASE_DB_URL (الجديدة)
// ومفاتيح التخزين للطرفين. لا يطبع أي سرّ.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const need = (k) => {
  if (!process.env[k]) { console.error(`✗ ${k} غير موجود في .env.local`); process.exit(1); }
  return process.env[k];
};
const OLD_URL = need("SUPABASE_DB_URL");
const NEW_URL = need("EU_SUPABASE_DB_URL");
if (OLD_URL === NEW_URL) { console.error("✗ القديمة والجديدة نفس الرابط"); process.exit(1); }

const client = (url) => new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const mode = process.argv[2];

// ── schema: كل الترحيلات بالترتيب على الجديدة ────────────────────────────
async function schema() {
  const dir = "supabase/migrations";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    execFileSync("node", ["scripts/db-apply.mjs", path.join(dir, f)], { stdio: "inherit", env: { ...process.env, SUPABASE_DB_URL: NEW_URL } });
  }
  console.log(`✓ ${files.length} ترحيلاً على فرانكفورت`);
}

// ── data: الجداول بترتيب المفاتيح الأجنبية، المعرّفات كما هي ───────────────
const SCHEMAS = ["auth", "public"];
// auth: الحسابات وهويّاتها فقط — الباقي (جلسات، رموز) يُعاد إنشاؤه عند الدخول
const AUTH_TABLES = ["users", "identities"];

async function tableOrder(db) {
  const { rows: tabs } = await db.query(
    `select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind='r' and n.nspname = any($1) order by 1,2`, [SCHEMAS]);
  const want = tabs.filter((r) => r.s === "public" || AUTH_TABLES.includes(r.t)).map((r) => `${r.s}.${r.t}`);
  const { rows: fks } = await db.query(
    `select n1.nspname||'.'||c1.relname child, n2.nspname||'.'||c2.relname parent
       from pg_constraint k join pg_class c1 on c1.oid=k.conrelid join pg_namespace n1 on n1.oid=c1.relnamespace
       join pg_class c2 on c2.oid=k.confrelid join pg_namespace n2 on n2.oid=c2.relnamespace
      where k.contype='f'`);
  const deps = new Map(want.map((t) => [t, new Set()]));
  for (const { child, parent } of fks) if (deps.has(child) && deps.has(parent) && child !== parent) deps.get(child).add(parent);
  const out = [];
  while (out.length < want.length) {
    const ready = want.filter((t) => !out.includes(t) && [...deps.get(t)].every((p) => out.includes(p)));
    if (!ready.length) throw new Error("دورة في المفاتيح الأجنبية: " + want.filter((t) => !out.includes(t)).join(", "));
    out.push(...ready);
  }
  return out;
}

async function columns(db, table) {
  const [s, t] = table.split(".");
  const { rows } = await db.query(
    `select a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=$1 and c.relname=$2 and a.attnum>0 and not a.attisdropped and a.attgenerated=''
      order by a.attnum`, [s, t]);
  return rows.map((r) => r.attname);
}

async function data() {
  const src = client(OLD_URL), dst = client(NEW_URL);
  await src.connect(); await dst.connect();
  const order = await tableOrder(src);
  const newCols = new Map();
  for (const t of order) newCols.set(t, new Set(await columns(dst, t)));
  for (const t of order) {
    const cols = (await columns(src, t)).filter((c) => newCols.get(t)?.has(c));
    if (!cols.length) { console.log(`· ${t}: لا أعمدة مشتركة — تُتخطّى`); continue; }
    const { rows } = await src.query(`select ${cols.map((c) => `"${c}"`).join(",")} from ${t}`);
    if (!rows.length) { console.log(`· ${t}: 0`); continue; }
    // الأصناف المكرّرة (0071) دُمجت في القديمة قبل النقل؛ ON CONFLICT للأمان لا للتغطية
    const B = 200;
    for (let i = 0; i < rows.length; i += B) {
      const chunk = rows.slice(i, i + B);
      const params = [], tuples = [];
      chunk.forEach((r, ri) => {
        tuples.push(`(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(",")})`);
        cols.forEach((c) => params.push(r[c]));
      });
      await dst.query(`insert into ${t} (${cols.map((c) => `"${c}"`).join(",")}) values ${tuples.join(",")} on conflict do nothing`, params);
    }
    console.log(`✓ ${t}: ${rows.length}`);
  }
  await src.end(); await dst.end();
}

// ── storage: الصور عبر الواجهة، لا عبر جدول storage.objects ─────────────
async function storage() {
  const oldUrl = need("NEXT_PUBLIC_SUPABASE_URL"), oldKey = need("SUPABASE_SERVICE_ROLE_KEY");
  const newUrl = need("EU_SUPABASE_URL"), newKey = need("EU_SUPABASE_SERVICE_ROLE_KEY");
  const h = (k) => ({ Authorization: `Bearer ${k}`, apikey: k });
  // bucket public
  const mk = await fetch(`${newUrl}/storage/v1/bucket`, { method: "POST", headers: { ...h(newKey), "Content-Type": "application/json" }, body: JSON.stringify({ id: "menu", name: "menu", public: true }) });
  if (!mk.ok && mk.status !== 409) console.log("bucket:", mk.status, await mk.text());
  const list = async (prefix) => {
    const r = await fetch(`${oldUrl}/storage/v1/object/list/menu`, { method: "POST", headers: { ...h(oldKey), "Content-Type": "application/json" }, body: JSON.stringify({ prefix, limit: 1000 }) });
    return r.json();
  };
  const walk = async (prefix) => {
    const items = await list(prefix);
    let n = 0;
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (!it.id) { n += await walk(p); continue; } // folder
      const get = await fetch(`${oldUrl}/storage/v1/object/menu/${p}`, { headers: h(oldKey) });
      if (!get.ok) { console.log("✗ تنزيل", p, get.status); continue; }
      const buf = Buffer.from(await get.arrayBuffer());
      const put = await fetch(`${newUrl}/storage/v1/object/menu/${p}`, { method: "POST", headers: { ...h(newKey), "Content-Type": get.headers.get("content-type") ?? "application/octet-stream", "x-upsert": "true" }, body: buf });
      if (!put.ok) console.log("✗ رفع", p, put.status, await put.text()); else n++;
    }
    return n;
  };
  console.log(`✓ صور منسوخة: ${await walk("")}`);
}

// ── verify: عدّ بعدّ ─────────────────────────────────────────────────────
async function verify() {
  const src = client(OLD_URL), dst = client(NEW_URL);
  await src.connect(); await dst.connect();
  const order = await tableOrder(src);
  let bad = 0;
  for (const t of order) {
    const a = (await src.query(`select count(*)::int c from ${t}`)).rows[0].c;
    const b = (await dst.query(`select count(*)::int c from ${t}`).catch(() => ({ rows: [{ c: -1 }] }))).rows[0].c;
    const ok = a === b;
    if (!ok) bad++;
    console.log(`${ok ? "✓" : "✗"} ${t}: ${a} → ${b}`);
  }
  const so = (await src.query(`select count(*)::int c from storage.objects where bucket_id='menu'`)).rows[0].c;
  const sn = (await dst.query(`select count(*)::int c from storage.objects where bucket_id='menu'`).catch(() => ({ rows: [{ c: -1 }] }))).rows[0].c;
  console.log(`${so === sn ? "✓" : "✗"} storage menu: ${so} → ${sn}`);
  await src.end(); await dst.end();
  console.log(bad ? `✗ ${bad} جدولاً لا يتطابق` : "✓ كل شيء متطابق");
  process.exit(bad ? 1 : 0);
}

const run = { schema, data, storage, verify }[mode];
if (!run) { console.error("الاستعمال: node scripts/migrate-eu.mjs schema|data|storage|verify"); process.exit(1); }
run().catch((e) => { console.error("✗", e.message); process.exit(1); });
