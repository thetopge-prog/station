// تصفير المبيعات قبل لحظة معيّنة — حذف نهائي، بعد نسخة احتياطية.
//
//   node scripts/zero-sales.mjs --before "2026-09-09T03:46:00+03:00"          يعرض ما سيُحذف ولا يحذف
//   node scripts/zero-sales.mjs --before "2026-09-09T03:46:00+03:00" --yes    يحذف
//
// يرفض العمل إن لم توجد نسخة احتياطية من اليوم في .backups/ (npm run backup).
// يُحذف: الطلبات وأصنافها (cascade) ونقاط الولاء الممنوحة عليها (فتنزل أرصدة
// الزبائن بالمشغّل نفسه). لا يُمسّ: الموظفون، الورديات، المنيو، المصاريف، الزبائن.

import fs from "node:fs";
import pg from "pg";

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const args = process.argv.slice(2);
const before = args[args.indexOf("--before") + 1];
const yes = args.includes("--yes");
if (!before || args.indexOf("--before") < 0 || Number.isNaN(Date.parse(before))) {
  console.error('الاستعمال: node scripts/zero-sales.mjs --before "2026-09-09T03:46:00+03:00" [--yes]');
  process.exit(1);
}

// نسخة احتياطية من اليوم أو لا شيء
const today = new Date().toISOString().slice(0, 10);
const backups = fs.existsSync(".backups") ? fs.readdirSync(".backups").filter((f) => f.startsWith(`station-${today}`)) : [];
if (!backups.length) {
  console.error("✗ لا نسخة احتياطية من اليوم في .backups/ — شغّل: npm run backup");
  process.exit(1);
}
console.log(`✓ نسخة احتياطية: ${backups.at(-1)}`);

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: [sum] } = await c.query(
  "select count(*)::int n, coalesce(sum(subtotal-discount+extra),0)::int total, min(created_at at time zone 'Asia/Baghdad')::text first, max(created_at at time zone 'Asia/Baghdad')::text last from orders where created_at < $1",
  [before],
);
const { rows: [pts] } = await c.query("select count(*)::int n, coalesce(sum(delta),0)::int delta from loyalty_events where order_id in (select id from orders where created_at < $1)", [before]);
console.log(`سيُحذف: ${sum.n} طلباً · ${sum.total.toLocaleString("en-US")} د.ع · من ${sum.first} إلى ${sum.last}`);
console.log(`ونقاط ولاء: ${pts.n} حركة · ${pts.delta} نقطة تُسحب من أرصدة الزبائن`);

if (!yes) {
  console.log("— عرض فقط. أضف --yes للحذف.");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  const a = await c.query("delete from loyalty_events where order_id in (select id from orders where created_at < $1)", [before]);
  const b = await c.query("delete from orders where created_at < $1", [before]);
  await c.query("commit");
  console.log(`✓ حُذف ${b.rowCount} طلباً و${a.rowCount} حركة نقاط. المبيعات قبل ${before} صفر.`);
} catch (e) {
  await c.query("rollback");
  console.error("✗ لم يُحذف شيء:", e.message);
  process.exit(1);
} finally {
  await c.end();
}
