// بوت ستيشن — Supabase Edge Function (Telegram webhook, يعمل 24/7).
// نفس بوت الأزرار الكامل: تقارير، الطلبات الآن، الطاولات، الأكثر/الأقل مبيعاً،
// إدارة المنتجات (إضافة/حذف/تسعير/تفعيل) — والحالة الحوارية محفوظة في bot_state.
// GET/POST ?job=daily (بسر x-job-secret) يرسل التقرير الليلي — يستدعيه pg_cron
// الساعة 23:59 بغداد. Deploy: supabase functions deploy telegram-bot --no-verify-jwt
/// <reference lib="deno.ns" />

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const OWNERS = (Deno.env.get("TG_OWNER_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const HOOK_SECRET = Deno.env.get("TG_WEBHOOK_SECRET") ?? "";
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const API = `https://api.telegram.org/bot${TOKEN}`;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const TABLE_COUNT = 12;

// ── utils ──────────────────────────────────────────────────────────────────
const fmt = (n: unknown) => new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const normDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const baghdadDay = (offsetDays = 0) =>
  new Date(Date.now() + 3 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const agoMin = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
/** Parse a user-typed date (digits already normalized) into yyyy-MM-dd, or null.
 *  Accepts 2026-08-10, 10/08/2026, 10-08-2026, or 10/08 (current year). Rejects
 *  impossible dates (e.g. 31/02) and any date in the future. */
function parseDate(s: string): string | null {
  s = s.trim();
  let y = "", mo = "", d = "";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = m[1]; mo = m[2]; d = m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/))) { d = m[1]; mo = m[2]; y = m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})$/))) { d = m[1]; mo = m[2]; y = baghdadDay().slice(0, 4); }
  else return null;
  const yy = +y, mm = +mo, dd = +d;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (isNaN(dt.getTime()) || dt.getUTCDate() !== dd || dt.getUTCMonth() + 1 !== mm) return null;
  if (iso > baghdadDay()) return null; // no future days
  return iso;
}

async function tg(method: string, payload: Record<string, unknown>) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
async function say(chatId: number | string, text: string, keyboard?: unknown[][], editMessageId?: number) {
  const payload: Record<string, unknown> = {
    chat_id: chatId, text, parse_mode: "HTML",
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  };
  if (editMessageId) {
    const r = await tg("editMessageText", { ...payload, message_id: editMessageId });
    if (r.ok) return;
  }
  await tg("sendMessage", payload);
}

// ── data (service-role REST) ───────────────────────────────────────────────
async function rest(path: string) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
// paginated GET — PostgREST caps a single response at 1000 rows, so page with
// Range until a short page is returned (used for wide item aggregations).
async function restAll(path: string): Promise<any[]> {
  const rows: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + size - 1}` } });
    if (!r.ok) throw new Error(`REST ${r.status}: ${(await r.text()).slice(0, 120)}`);
    const chunk = await r.json();
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < size) break;
  }
  return rows;
}
async function restWrite(path: string, method: string, body?: unknown) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: "return=minimal" }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${r.status}: ${(await r.text()).slice(0, 160)}`);
}
const summary = (from: string, to: string) =>
  fetch(`${URL_}/rest/v1/rpc/range_summary`, { method: "POST", headers: H, body: JSON.stringify({ p_from: from, p_to: to }) }).then((r) => r.json());

async function countOrdersToday() {
  const r = await fetch(`${URL_}/rest/v1/orders?business_day=eq.${baghdadDay()}&select=id`, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  return Number((r.headers.get("content-range") ?? "/0").split("/")[1]) || 0;
}
const pendingOrders = () =>
  rest("orders?status=eq.pending&select=order_seq,channel,table_no,subtotal,created_at&order=created_at.asc");
const todayTableOrders = () =>
  rest(`orders?business_day=eq.${baghdadDay()}&table_no=not.is.null&select=table_no,status,order_seq,created_at&order=created_at.desc`);
const soldByItem = (fromDay: string) =>
  restAll(`order_items?select=name_ar,qty,orders!inner(status,business_day)&orders.status=eq.paid&orders.business_day=gte.${fromDay}`);
const allItems = () => rest("menu_items?select=id,name_ar,price,cost,is_active,category_id&order=sort.asc");
const allCats = () => rest("categories?select=id,name_ar,sort&order=sort.asc");
const oneItem = async (id: string) =>
  (await rest(`menu_items?id=eq.${id}&select=id,name_ar,price,cost,is_active,category_id`))[0];

// conversational state, persisted (edge functions are stateless)
async function getState(chatId: number | string) {
  const rows = await rest(`bot_state?chat_id=eq.${chatId}&select=state`);
  return rows[0]?.state ?? null;
}
async function setState(chatId: number | string, state: unknown) {
  await restWrite("bot_state?on_conflict=chat_id", "POST", [{ chat_id: String(chatId), state }]);
}
async function clearState(chatId: number | string) {
  await restWrite(`bot_state?chat_id=eq.${chatId}`, "DELETE");
}

// ── views ──────────────────────────────────────────────────────────────────
const CHANNEL_AR: Record<string, string> = { qr: "موبايل", kiosk: "لوحي", cashier: "كاشير" };
const BACK = [{ text: "⬅️ القائمة الرئيسية", callback_data: "menu" }];

function mainMenu() {
  return [
    [{ text: "📊 اليوم", callback_data: "rpt|0" }, { text: "📅 الأسبوع", callback_data: "rpt|6" }, { text: "🗓️ الشهر", callback_data: "rpt|29" }],
    [{ text: "📆 مبيعات أمس", callback_data: "day|1" }, { text: "🔎 مبيعات بتاريخ", callback_data: "search" }],
    [{ text: "🧾 الطلبات الآن", callback_data: "now" }, { text: "🍽️ الطاولات", callback_data: "tables" }],
    [{ text: "🔥 الأكثر والأقل مبيعاً", callback_data: "top" }, { text: "📃 مبيعات كل منتج", callback_data: "counts" }],
    [{ text: "📋 المنتجات المتاحة", callback_data: "avail" }, { text: "⚙️ إدارة المنتجات", callback_data: "pcats" }],
    [{ text: "🌙 التقرير اليومي النهائي", callback_data: "final" }, { text: "📉 إضافة مصروف", callback_data: "expadd" }],
    [{ text: "💵 رصيد الكاشير", callback_data: "drawer" }, { text: "🧾 آخر ١٠ مبيعات", callback_data: "sales" }],
    [{ text: "💳 آخر ١٠ مدفوعات", callback_data: "pays" }, { text: "📺 شاشة الطلبات", callback_data: "queue" }],
    [{ text: "📦 المخزون", callback_data: "stock" }, { text: "⚠️ النواقص", callback_data: "short" }],
    [{ text: "🛒 قائمة المشتريات", callback_data: "po" }, { text: "👨‍🍳 التحكم بالتجهيز", callback_data: "prep" }],
    [{ text: "🛵 حسابات شركات التوصيل", callback_data: "prt" }],
  ];
}

type Row = Record<string, any>;
function sumRows(rows: Row[]) {
  return (Array.isArray(rows) ? rows : []).reduce(
    (a, d) => ({ s: a.s + +d.sales, c: a.c + +d.orders_count, p: a.p + +d.profit, e: a.e + +d.expenses, n: a.n + +d.net }),
    { s: 0, c: 0, p: 0, e: 0, n: 0 },
  );
}

async function viewReport(days: number) {
  const to = baghdadDay(), from = baghdadDay(-days);
  const t = sumRows(await summary(from, to));
  const title = days === 0 ? `اليوم ${to}` : days === 6 ? "آخر ٧ أيام" : "آخر ٣٠ يوماً";
  return [
    `🍔 <b>ستيشن — ${title}</b>`, "",
    `🧾 الطلبات: <b>${t.c}</b>`,
    `💰 المبيعات: <b>${fmt(t.s)} د.ع</b>`,
    `📈 الأرباح: <b>${fmt(t.p)} د.ع</b>`,
    `📉 المصروفات: <b>${fmt(t.e)} د.ع</b>`,
    `✅ الصافي: <b>${fmt(t.n)} د.ع</b>`,
  ].join("\n");
}

/** Full totals for one business day — for reconciling the drawer with a day that
 *  has already rolled over past midnight (business_day is a Baghdad calendar day). */
async function viewDaySummary(day: string) {
  const t = sumRows(await summary(day, day));
  const suffix = day === baghdadDay(-1) ? " (أمس)" : day === baghdadDay() ? " (اليوم)" : "";
  return [
    `📆 <b>مبيعات يوم ${day}${suffix}</b>`, "",
    `🧾 الطلبات: <b>${t.c}</b>`,
    `💰 المبيعات: <b>${fmt(t.s)} د.ع</b>`,
    `📈 الأرباح: <b>${fmt(t.p)} د.ع</b>`,
    `📉 المصروفات: <b>${fmt(t.e)} د.ع</b>`,
    `✅ الصافي: <b>${fmt(t.n)} د.ع</b>`,
  ].join("\n");
}

async function viewNow() {
  const [pending, total] = await Promise.all([pendingOrders(), countOrdersToday()]);
  const lines = [`🧾 <b>الطلبات الآن</b>`, "", `المعلّقة (بانتظار الدفع): <b>${pending.length}</b>`];
  for (const o of pending.slice(0, 15)) {
    lines.push(`#${String(o.order_seq).padStart(3, "0")} — ${CHANNEL_AR[o.channel] ?? o.channel}${o.table_no ? ` — طاولة ${esc(o.table_no)}` : ""} — <b>${fmt(o.subtotal)} د.ع</b> (قبل ${agoMin(o.created_at)} د)`);
  }
  if (pending.length === 0) lines.push("لا يوجد طلبات معلّقة ✅");
  lines.push("", `إجمالي طلبات اليوم: <b>${total}</b>`);
  return lines.join("\n");
}

async function viewTables() {
  const [rows, cfg] = await Promise.all([
    todayTableOrders(),
    rest("cafe_tables?select=name,active,sort&active=eq.true&order=sort.asc"),
  ]);
  const names: string[] = (cfg as Row[]).map((t) => String(t.name));
  const tableNames = names.length ? names : Array.from({ length: TABLE_COUNT }, (_, i) => String(i + 1));
  const label = (t: string) => (/^\d+$/.test(t) ? `طاولة ${t}` : t);

  const latest = new Map<string, Row>();
  for (const o of rows) if (!latest.has(o.table_no)) latest.set(o.table_no, o);
  const lines = [`🍽️ <b>حالة الطاولات — اليوم</b>`, ""];
  const empty: string[] = [];
  for (const t of tableNames) {
    const o = latest.get(t);
    if (!o) { empty.push(label(t)); continue; }
    const age = agoMin(o.created_at);
    if (o.status === "pending") lines.push(`🔴 ${label(t)}: طلب #${String(o.order_seq).padStart(3, "0")} بانتظار الدفع (قبل ${age} د)`);
    else if (o.status === "paid" && age <= 60) lines.push(`🟢 ${label(t)}: مشغولة — دُفع قبل ${age} د`);
    else empty.push(label(t));
  }
  // orders on tables not in the active layout
  for (const [t, o] of latest) {
    if (!tableNames.includes(t) && (o.status === "pending" || agoMin(o.created_at) <= 60)) {
      lines.push(`🟡 ${label(t)}: ${o.status === "pending" ? "بانتظار الدفع" : "مشغولة"}`);
    }
  }
  lines.push("", empty.length === tableNames.length ? "كل الطاولات فارغة." : `الطاولات الفارغة: ${empty.join("، ") || "لا شيء"}`);
  return lines.join("\n");
}

async function aggregateSold(fromDay: string) {
  const [sold, items] = await Promise.all([soldByItem(fromDay), allItems()]);
  const byName = new Map<string, number>();
  for (const it of items) if (it.is_active) byName.set(it.name_ar, 0);
  for (const s of Array.isArray(sold) ? sold : []) byName.set(s.name_ar, (byName.get(s.name_ar) ?? 0) + s.qty);
  return [...byName.entries()].sort((a, b) => b[1] - a[1]);
}

async function viewTop() {
  const sorted = await aggregateSold(baghdadDay(-29));
  const total = sorted.reduce((s, [, q]) => s + q, 0);
  const lines = [`🔥 <b>الأكثر مبيعاً — آخر ٣٠ يوماً</b>`, ""];
  sorted.slice(0, 5).forEach(([n, q], i) => lines.push(`${i + 1}. ${esc(n)} — <b>${q}</b>`));
  lines.push("", `📉 <b>الأقل طلباً</b>`);
  sorted.slice(-5).reverse().forEach(([n, q]) => lines.push(`• ${esc(n)} — <b>${q}</b>`));
  lines.push("", `📦 مجموع القطع المباعة: <b>${total}</b>`);
  return lines.join("\n");
}

async function viewCounts() {
  const sorted = await aggregateSold(baghdadDay(-29));
  const lines = [`📃 <b>مبيعات كل منتج — آخر ٣٠ يوماً</b>`, ""];
  sorted.forEach(([n, q]) => lines.push(`${esc(n)} — <b>${q}</b>`));
  return lines.join("\n").slice(0, 4000);
}

async function viewAvail() {
  const [items, cats] = await Promise.all([allItems(), allCats()]);
  const lines = [`📋 <b>المنتجات المتاحة حالياً</b>`, ""];
  let off = 0;
  for (const c of cats) {
    const act = items.filter((i: Row) => i.category_id === c.id && i.is_active);
    off += items.filter((i: Row) => i.category_id === c.id && !i.is_active).length;
    if (!act.length) continue;
    lines.push(`<b>${esc(c.name_ar)}</b>`);
    for (const i of act) lines.push(`• ${esc(i.name_ar)} — ${fmt(i.price)} د.ع`);
    lines.push("");
  }
  lines.push(off ? `⛔ معطّل حالياً: ${off} منتج` : "كل المنتجات مفعّلة ✅");
  return lines.join("\n").slice(0, 4000);
}

async function viewDailyFinal() {
  const today = baghdadDay();
  const t = sumRows(await summary(today, today));
  const sold = (await aggregateSold(today)).filter(([, q]) => q > 0);
  const guests = sold.reduce((s, [, q]) => s + q, 0); // one item ≈ one guest
  const closure = (await rest(`register_closures?business_day=eq.${today}&select=remaining,note`))[0];
  // money the shop has earned but not received. Only positive balances: a
  // company that overpaid is holding credit, which is not a receivable.
  const owed = ((await partnerBalances()) as Row[]).reduce((a, p) => a + Math.max(0, +p.balance), 0);
  const lines = [
    `🌙 <b>التقرير اليومي النهائي — ${today}</b>`, "",
    `🧾 عدد الطلبات: <b>${t.c}</b>`,
    `👥 عدد الزبائن (تقديري): <b>${guests}</b>`,
    `💰 المبيعات: <b>${fmt(t.s)} د.ع</b>`,
    `📈 الأرباح: <b>${fmt(t.p)} د.ع</b>`,
    `📉 المصروفات: <b>${fmt(t.e)} د.ع</b>`,
    `✅ الصافي: <b>${fmt(t.n)} د.ع</b>`,
    closure
      ? `🏦 المتبقي في الصندوق: <b>${fmt(closure.remaining)} د.ع</b>${closure.note ? ` — ${esc(closure.note)}` : ""}`
      : `🏦 المتبقي في الصندوق: لم يُسجَّل (يُدخل من صفحة المصروفات)`,
    ...(owed ? [`🛵 مستحق على شركات التوصيل: <b>${fmt(owed)} د.ع</b>`] : []),
    "",
    `🍔 <b>الأصناف المباعة اليوم (${sold.reduce((s, [, q]) => s + q, 0)} قطعة):</b>`,
  ];
  if (sold.length === 0) lines.push("لا مبيعات اليوم.");
  else sold.forEach(([n, q]) => lines.push(`• ${esc(n)} — <b>${q}</b>`));
  return lines.join("\n").slice(0, 4000);
}

async function kbCategories() {
  const cats = await allCats();
  const rows = cats.map((c: Row) => [{ text: c.name_ar, callback_data: `pcat|${c.id}` }]);
  rows.push(BACK);
  return rows;
}
async function kbItems(catId: string) {
  const items = (await allItems()).filter((i: Row) => i.category_id === catId);
  const rows = items.map((i: Row) => [{ text: `${i.is_active ? "" : "⛔ "}${i.name_ar} — ${fmt(i.price)}`, callback_data: `pitem|${i.id}` }]);
  rows.push([{ text: "➕ إضافة منتج هنا", callback_data: `padd|${catId}` }]);
  rows.push([{ text: "⬅️ الأقسام", callback_data: "pcats" }, ...BACK]);
  return rows;
}
function kbItem(it: Row) {
  return [
    [{ text: "💰 تعديل السعر", callback_data: `pset|${it.id}|price` }, { text: "🏷️ تعديل الكلفة", callback_data: `pset|${it.id}|cost` }],
    [{ text: it.is_active ? "⛔ تعطيل" : "✅ تفعيل", callback_data: `ptog|${it.id}` }, { text: "🗑️ حذف", callback_data: `pdel|${it.id}` }],
    [{ text: "⬅️ رجوع", callback_data: `pcat|${it.category_id}` }, ...BACK],
  ];
}
const itemText = (it: Row) =>
  [`⚙️ <b>${esc(it.name_ar)}</b>`, "", `💰 السعر: <b>${fmt(it.price)} د.ع</b>`, `🏷️ الكلفة: <b>${fmt(it.cost)} د.ع</b>`, `الحالة: ${it.is_active ? "مفعّل ✅" : "معطّل ⛔"}`].join("\n");

// ── handlers ───────────────────────────────────────────────────────────────
const authorized = (chatId: number | string) => !OWNERS.length || OWNERS.includes(String(chatId));

/* ══════════════════════════════════════════════════════════════════════════
   Operations views — inventory, drawer, sales, and expediting from the phone.

   These all read through PostgREST with the service key. They deliberately do
   NOT call the SQL RPCs that back the same screens in the app: those are
   guarded by is_staff(), which reads auth.uid(), and the bot has no signed-in
   user — every such call would fail. Reading the tables directly is both
   simpler and the only thing that works here.
   ══════════════════════════════════════════════════════════════════════════ */

/** المبلغ الآن في الكاشير — computed live, the same arithmetic as the Z-report. */
async function viewDrawer() {
  const sessions = await rest("cashier_sessions?select=id,cashier_id,opening_float,opened_at,deposited&closed_at=is.null");
  if (!sessions.length) return "💵 <b>رصيد الكاشير</b>\n\nلا توجد وردية مفتوحة الآن.";

  const lines = ["💵 <b>رصيد الكاشير</b>", ""];
  for (const s of sessions as Row[]) {
    const [emp] = await rest(`employees?select=name_ar&id=eq.${s.cashier_id}`);
    const paid = await rest(
      `orders?select=subtotal,discount,extra,payment_method&session_id=eq.${s.id}&status=eq.paid`,
    );
    const exp = await rest(`expenses?select=amount&session_id=eq.${s.id}`);

    const net = (o: Row) => +o.subtotal - +o.discount + +o.extra;
    const cash = (paid as Row[]).filter((o) => o.payment_method === "cash").reduce((a, o) => a + net(o), 0);
    const card = (paid as Row[]).filter((o) => o.payment_method === "card").reduce((a, o) => a + net(o), 0);
    const spent = (exp as Row[]).reduce((a, e) => a + +e.amount, 0);
    const expected = +s.opening_float + cash - spent - +s.deposited;

    lines.push(
      `👤 <b>${esc(emp?.name_ar ?? "—")}</b> — منذ ${agoMin(s.opened_at)} دقيقة`,
      `الافتتاحي: <b>${fmt(s.opening_float)}</b>`,
      `مبيعات نقدية: <b>${fmt(cash)}</b>`,
      `مصروفات: <b>-${fmt(spent)}</b>`,
      +s.deposited > 0 ? `مودع للإدارة: <b>-${fmt(s.deposited)}</b>` : "",
      `━━━━━━━━━━━━━━━`,
      `💰 المتوقّع في الصندوق: <b>${fmt(expected)} د.ع</b>`,
      `💳 كي كارد (خارج الصندوق): ${fmt(card)}`,
      `عدد الطلبات: ${(paid as Row[]).length}`,
      "",
    );
  }
  return lines.filter(Boolean).join("\n");
}

/** آخر ١٠ عمليات بيع — newest orders, whatever their payment state. */
async function viewLastSales() {
  const rows = await rest(
    "orders?select=order_seq,channel,table_no,subtotal,discount,extra,status,created_at,pickup_code&order=created_at.desc&limit=10",
  );
  if (!rows.length) return "🧾 لا توجد مبيعات بعد.";
  const st: Record<string, string> = { pending: "⏳", paid: "✅", cancelled: "❌", refunded: "↩️" };
  const lines = ["🧾 <b>آخر ١٠ عمليات بيع</b>", ""];
  for (const o of rows as Row[]) {
    const total = +o.subtotal - +o.discount + +o.extra;
    lines.push(
      `${st[o.status] ?? ""} #${String(o.order_seq).padStart(3, "0")} — ${CHANNEL_AR[o.channel] ?? o.channel}` +
        `${o.table_no ? ` (طاولة ${esc(o.table_no)})` : ""} — <b>${fmt(total)}</b> — ${agoMin(o.created_at)}د`,
    );
  }
  return lines.join("\n");
}

/** آخر ١٠ عمليات دفع — only what was actually collected, and how. */
async function viewLastPayments() {
  const rows = await rest(
    "orders?select=order_seq,subtotal,discount,extra,payment_method,paid_at,cashier_id&status=eq.paid&paid_at=not.is.null&order=paid_at.desc&limit=10",
  );
  if (!rows.length) return "💳 لا توجد مدفوعات بعد.";

  const ids = [...new Set((rows as Row[]).map((o) => o.cashier_id).filter(Boolean))];
  const emps = ids.length ? await rest(`employees?select=id,name_ar&id=in.(${ids.join(",")})`) : [];
  const name = new Map((emps as Row[]).map((e) => [e.id, e.name_ar]));

  const lines = ["💳 <b>آخر ١٠ عمليات دفع</b>", ""];
  let cash = 0, card = 0, billed = 0;
  for (const o of rows as Row[]) {
    const total = +o.subtotal - +o.discount + +o.extra;
    // A delivery-company order is revenue, but no money changed hands at the
    // counter. Counting it as cash would inflate the drawer and accuse a
    // cashier of a shortage they did not cause.
    if (o.payment_method === "partner") billed += total;
    else if (o.payment_method === "card") card += total;
    else cash += total;
    lines.push(
      `${o.payment_method === "partner" ? "🛵" : o.payment_method === "card" ? "💳" : "💵"} #${String(o.order_seq).padStart(3, "0")} — <b>${fmt(total)}</b>` +
        `${o.cashier_id ? ` — ${esc(name.get(o.cashier_id) ?? "")}` : ""} — ${agoMin(o.paid_at)}د`,
    );
  }
  lines.push(
    "",
    `المجموع: نقدي <b>${fmt(cash)}</b> · كي كارد <b>${fmt(card)}</b>` +
      (billed ? ` · على الشركات <b>${fmt(billed)}</b>` : ""),
  );
  return lines.join("\n");
}

/* ── شركات التوصيل ─────────────────────────────────────────────────────────
   Talabat and the rest take the food now and transfer the money next week, so
   what matters is not a receipt — it is a running balance per company, and how
   old it is. Everything below reads partner_balances (0045), which computes
   billed − settled. There is deliberately no "paid" flag on an order: the
   companies settle in bulk against a total and never per order, so marking
   individual orders paid would be inventing a reconciliation nobody sends. */

const partnerBalances = () => rest("partner_balances?select=*&order=balance.desc,name_ar.asc");

async function viewPartners() {
  const rows = (await partnerBalances()) as Row[];
  if (!rows.length) {
    return "🛵 <b>حسابات شركات التوصيل</b>\n\nلا توجد شركات مسجّلة بعد.\nأضِفها من صفحة «شركات التوصيل» في النظام.";
  }

  const lines = ["🛵 <b>حسابات شركات التوصيل</b>", ""];
  let owed = 0;
  for (const p of rows) {
    const bal = +p.balance;
    owed += bal;
    lines.push(
      `${bal > 0 ? "🔴" : "🟢"} <b>${esc(p.name_ar)}</b>${p.is_active ? "" : " (متوقفة)"}`,
      bal > 0
        ? `   المستحق: <b>${fmt(bal)} د.ع</b>`
        : bal < 0
          ? `   💠 دفعت زيادة — رصيد لها: <b>${fmt(-bal)} د.ع</b>`
          : "   لا يوجد مستحق ✅",
      `   مبيعات: ${fmt(p.billed)} · مسدّد: ${fmt(p.settled)} · ${p.orders_count} طلب`,
      ...(p.last_order_at ? [`   آخر طلب: قبل ${agoMin(p.last_order_at)} دقيقة`] : []),
      "",
    );
  }
  lines.push("━━━━━━━━━━━━", `📌 <b>إجمالي المستحق: ${fmt(owed)} د.ع</b>`);
  return lines.join("\n");
}

function kbPartners(rows: Row[]) {
  const kb: unknown[][] = rows.map((p) => [{ text: `📄 ${p.name_ar}`, callback_data: `prtl|${p.id}` }]);
  kb.push([{ text: "➕ إضافة شركة", callback_data: "prta" }, { text: "🔄 تحديث", callback_data: "prt" }]);
  kb.push(BACK);
  return kb;
}

/** كشف حساب — the statement a company would ask for over the phone. */
async function viewPartnerLedger(id: string) {
  const [p] = (await rest(`partner_balances?id=eq.${id}&select=*`)) as Row[];
  if (!p) return "الشركة غير موجودة.";

  const orders = (await rest(
    `orders?partner_id=eq.${id}&status=neq.cancelled&select=order_seq,subtotal,discount,extra,created_at` +
      `&order=created_at.desc&limit=10`,
  )) as Row[];
  const paid = (await rest(
    `partner_settlements?partner_id=eq.${id}&select=amount,method,note,business_day&order=created_at.desc&limit=5`,
  )) as Row[];

  const lines = [
    `📄 <b>كشف حساب — ${esc(p.name_ar)}</b>`,
    "",
    +p.balance > 0
      ? `🔴 المستحق الآن: <b>${fmt(p.balance)} د.ع</b>`
      : +p.balance < 0
        ? `💠 دفعت زيادة — رصيد لها عندنا: <b>${fmt(-p.balance)} د.ع</b>`
        : "🟢 الحساب مسدّد بالكامل ✅",
    `مبيعات: <b>${fmt(p.billed)}</b> · مسدّد: <b>${fmt(p.settled)}</b> · ${p.orders_count} طلب`,
    "",
    "🧾 <b>آخر الطلبات</b>",
  ];
  if (!orders.length) lines.push("لا توجد طلبات.");
  else
    for (const o of orders) {
      const total = +o.subtotal - +o.discount + +o.extra;
      lines.push(`• #${String(o.order_seq).padStart(3, "0")} — <b>${fmt(total)}</b> — ${String(o.created_at).slice(0, 10)}`);
    }

  lines.push("", "💰 <b>آخر التسديدات</b>");
  if (!paid.length) lines.push("لم يصل أي تسديد بعد.");
  else
    for (const s of paid) {
      lines.push(`• <b>${fmt(s.amount)}</b> — ${SETTLE_AR[s.method] ?? s.method} — ${s.business_day}${s.note ? ` — ${esc(s.note)}` : ""}`);
    }

  return lines.join("\n");
}

const SETTLE_AR: Record<string, string> = { cash: "نقداً", transfer: "حوالة", other: "أخرى" };

/** Which way the money arrived, read off what the owner typed. */
function settleMethod(note: string): "cash" | "transfer" | "other" {
  if (/نقد|كاش/.test(note)) return "cash";
  if (/حوال|تحويل|بنك|زين كاش|اسيا|آسيا/.test(note)) return "transfer";
  return "transfer";
}

function kbLedger(id: string, active = true) {
  return [
    [{ text: "💰 تسجيل تسديد", callback_data: `prts|${id}` }],
    [{ text: active ? "⛔ إيقاف الشركة" : "✅ إعادة التفعيل", callback_data: `prtt|${id}` }],
    [{ text: "🔄 تحديث", callback_data: `prtl|${id}` }, { text: "⬅️ الشركات", callback_data: "prt" }],
    BACK,
  ];
}

/** شاشة الطلبات — what the waiting-area TV is showing right now. */
async function viewQueue() {
  const rows = await rest(
    `orders?select=id,order_seq,prep_status,channel,table_no,pickup_code,created_at,expediter_id` +
      `&business_day=eq.${baghdadDay()}&prep_status=in.(new,preparing,ready)&status=neq.cancelled&order=created_at.asc`,
  );
  const prep = (rows as Row[]).filter((o) => o.prep_status !== "ready");
  const ready = (rows as Row[]).filter((o) => o.prep_status === "ready");

  const line = (o: Row) =>
    `#${String(o.order_seq).padStart(3, "0")}${o.pickup_code ? ` · <code>${esc(o.pickup_code)}</code>` : ""}` +
    `${o.table_no ? ` · طاولة ${esc(o.table_no)}` : ` · ${CHANNEL_AR[o.channel] ?? o.channel}`} · ${agoMin(o.created_at)}د`;

  const out = ["📺 <b>شاشة الطلبات</b>", "", `🔵 <b>تحت التحضير (${prep.length})</b>`];
  out.push(prep.length ? prep.map(line).join("\n") : "—");
  out.push("", `🟢 <b>جاهز للاستلام (${ready.length})</b>`);
  out.push(ready.length ? ready.map(line).join("\n") : "—");
  return out.join("\n");
}

/** التحكم بالتجهيز — one button per order, tap to mark it ready. */
async function kbPrep() {
  const rows = await rest(
    `orders?select=id,order_seq,prep_status,table_no,channel&business_day=eq.${baghdadDay()}` +
      `&prep_status=in.(new,preparing)&status=neq.cancelled&order=created_at.asc&limit=12`,
  );
  const kb = (rows as Row[]).map((o) => [
    {
      text: `✅ #${String(o.order_seq).padStart(3, "0")} ${o.table_no ? `طاولة ${o.table_no}` : CHANNEL_AR[o.channel] ?? ""} — جاهز`,
      callback_data: `prepok|${o.id}`,
    },
  ]);
  kb.push([{ text: "🔄 تحديث", callback_data: "prep" }]);
  kb.push(BACK);
  return kb;
}

/**
 * Mark an order ready from the phone.
 *
 * A direct PATCH rather than the confirm_assembled RPC: that function is
 * is_staff()-guarded and the bot has no auth.uid(). The expediter stamped is
 * whoever holds the open shift, which is the same person the printed ticket
 * already names.
 */
async function markReady(orderId: string) {
  const [shift] = await rest(
    `shifts?select=employee_id&closed_at=is.null&role=eq.expediter&business_day=eq.${baghdadDay()}&limit=1`,
  );
  const [ord] = await rest(`orders?select=order_seq,expediter_id&id=eq.${orderId}`);
  if (!ord) return "الطلب غير موجود.";
  await restWrite(`orders?id=eq.${orderId}`, "PATCH", {
    prep_status: "ready",
    expediter_id: ord.expediter_id ?? shift?.employee_id ?? null,
  });
  return `✅ الطلب #${String(ord.order_seq).padStart(3, "0")} أصبح <b>جاهزاً</b> — ظهر على شاشة الزبائن.`;
}

/** المخزون — grouped by category, urgent first. */
async function viewStock() {
  const rows = await rest("stock_status?select=name_ar,unit,category,min_qty,on_hand,nearest_expiry,stock_state");
  if (!rows.length) return "📦 لا توجد مواد في المخزون.";

  const today = new Date(baghdadDay() + "T00:00:00Z").getTime();
  const days = (d: string | null) => (d ? Math.round((new Date(d + "T00:00:00Z").getTime() - today) / 86400000) : null);
  const icon = (r: Row) => (r.stock_state === "out" ? "🔴" : r.stock_state === "low" ? "🟡" : "🟢");

  const byCat = new Map<string, Row[]>();
  for (const r of rows as Row[]) {
    const k = r.category ?? "أخرى";
    byCat.set(k, [...(byCat.get(k) ?? []), r]);
  }

  const lines = ["📦 <b>المخزون</b>", ""];
  for (const [cat, items] of byCat) {
    lines.push(`<b>${esc(cat)}</b>`);
    for (const r of items) {
      const d = days(r.nearest_expiry);
      const warn = d === null ? "" : d < 0 ? ` ⛔ منتهية` : d <= 3 ? ` ⏰ ${d}ي` : "";
      lines.push(`${icon(r)} ${esc(r.name_ar)}: <b>${r.on_hand}</b> ${esc(r.unit)}${warn}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** النواقص — only what is at or below its reorder point. */
async function viewShortages() {
  const rows = await rest("stock_status?select=name_ar,unit,min_qty,on_hand,stock_state&stock_state=in.(low,out)");
  if (!rows.length) return "✅ <b>لا توجد نواقص</b> — كل المواد فوق حد الطلب.";
  const lines = [`⚠️ <b>النواقص (${rows.length})</b>`, ""];
  for (const r of rows as Row[]) {
    lines.push(
      `${r.stock_state === "out" ? "🔴 نفدت" : "🟡 قاربت"} — ${esc(r.name_ar)}: <b>${r.on_hand}</b> / حد الطلب ${r.min_qty} ${esc(r.unit)}`,
    );
  }
  lines.push("", "اضغط «🛒 قائمة المشتريات» لتوليد فاتورة النواقص.");
  return lines.join("\n");
}

/**
 * قائمة المشتريات المطلوبة.
 *
 * Computed here rather than by calling generate_shortage_po(): that RPC is
 * is_staff()-guarded, and it also WRITES a purchase order. Reading a shopping
 * list on the phone should not create a document every time the owner glances
 * at it — the app's /inventory screen is where a PO gets recorded.
 */
async function viewPurchaseList() {
  const rows = await rest("stock_status?select=name_ar,unit,min_qty,on_hand,avg_unit_cost&stock_state=in.(low,out)");
  if (!rows.length) return "✅ لا توجد مشتريات مطلوبة.";
  const lines = ["🛒 <b>قائمة المشتريات المطلوبة</b>", ""];
  let total = 0;
  for (const r of rows as Row[]) {
    // top up to twice the reorder point so the buyer is not back tomorrow
    const need = Math.max(+r.min_qty * 2 - +r.on_hand, +r.min_qty, 1);
    const cost = need * +r.avg_unit_cost;
    total += cost;
    lines.push(`• ${esc(r.name_ar)} — <b>${need}</b> ${esc(r.unit)}${cost > 0 ? ` (~${fmt(Math.round(cost))})` : ""}`);
  }
  if (total > 0) lines.push("", `التقدير الإجمالي: <b>${fmt(Math.round(total))} د.ع</b>`);
  lines.push("", "<i>التقدير من متوسط أسعار آخر الدفعات.</i>");
  return lines.join("\n");
}

async function onMessage(msg: Row) {
  const chatId = msg.chat.id;
  if (!authorized(chatId)) {
    await say(chatId, `غير مصرّح لك بهذا البوت.\nمعرّفك: <code>${chatId}</code>`);
    return;
  }
  const state = await getState(chatId);
  if (state) {
    await clearState(chatId);
    const text = normDigits(String(msg.text).trim());
    if (state.action === "searchdate") {
      const day = parseDate(text);
      if (!day) {
        await say(chatId, "تاريخ غير صالح — أرسل مثل: <code>2026-08-10</code> أو <code>10/08/2026</code>", [[{ text: "🔎 حاول مجدداً", callback_data: "search" }], BACK]);
        return;
      }
      await say(chatId, await viewDaySummary(day), [[{ text: "🔄 تحديث", callback_data: `dayx|${day}` }], BACK]);
      return;
    }
    if (state.action === "price" || state.action === "cost") {
      const val = Math.round(Number(text.replace(/[^\d.]/g, "")));
      if (!Number.isFinite(val) || val < 0) { await say(chatId, "قيمة غير صالحة — أرسل رقماً مثل: 3500", [BACK]); return; }
      await restWrite(`menu_items?id=eq.${state.itemId}`, "PATCH", { [state.action]: val });
      const it = await oneItem(state.itemId);
      await say(chatId, `تم التحديث ✅\n\n${itemText(it)}`, kbItem(it));
      return;
    }
    if (state.action === "partner") {
      const parts = text.trim().split(/\s+/);
      const maybePhone = parts.length > 1 && /^[\d+][\d\s-]{6,}$/.test(parts[parts.length - 1]);
      const phone = maybePhone ? parts[parts.length - 1] : null;
      const name = (maybePhone ? parts.slice(0, -1) : parts).join(" ").trim();
      if (!name) {
        await say(chatId, "أرسل اسم الشركة، مثال: <code>كريم فود 07701234567</code>", [BACK]);
        return;
      }
      try {
        await restWrite("delivery_partners", "POST", { name_ar: name, phone, sort: 99 });
      } catch (e) {
        // name_ar is unique — the usual cause is the company already exists,
        // possibly disabled, and re-adding it would split its history in two
        const dup = String(e).includes("duplicate") || String(e).includes("23505");
        await say(chatId, dup ? `«${esc(name)}» مسجّلة مسبقاً — افتحها من القائمة.` : `تعذّرت الإضافة: ${esc(String(e).slice(0, 120))}`, [
          [{ text: "🛵 الشركات", callback_data: "prt" }],
        ]);
        return;
      }
      await say(chatId, `تمت إضافة <b>${esc(name)}</b> ✅`, kbPartners((await partnerBalances()) as Row[]));
      return;
    }
    if (state.action === "settle") {
      const parts = text.split(/\s+/);
      const amount = Math.round(Number(parts[0].replace(/[^\d.]/g, "")));
      const note = parts.slice(1).join(" ").trim();
      if (!Number.isFinite(amount) || amount <= 0) {
        await say(chatId, "الصيغة: <i>المبلغ ثم الوصف</i>\nمثال: <code>250000 حوالة</code>", [BACK]);
        return;
      }
      await restWrite("partner_settlements", "POST", {
        partner_id: state.partnerId,
        amount,
        method: settleMethod(note),
        note: note || null,
        business_day: baghdadDay(),
      });
      // read the balance back rather than computing it here: the view is the
      // one place that decides what "owed" means, and two answers to that
      // question is how a company ends up arguing with a receipt
      const [p] = (await rest(`partner_balances?id=eq.${state.partnerId}&select=name_ar,balance,is_active`)) as Row[];
      await say(
        chatId,
        `تم تسجيل التسديد ✅\n💰 <b>${fmt(amount)} د.ع</b> من <b>${esc(p?.name_ar ?? "")}</b>` +
          `\n\n${
            +(p?.balance ?? 0) > 0
              ? `🔴 المتبقي: <b>${fmt(p.balance)} د.ع</b>`
              : +(p?.balance ?? 0) < 0
                ? `💠 دفعت زيادة بمقدار <b>${fmt(-p.balance)} د.ع</b>`
                : "🟢 الحساب مسدّد بالكامل"
          }`,
        kbLedger(String(state.partnerId), !!p?.is_active),
      );
      return;
    }
    if (state.action === "expense") {
      const parts = text.split(/\s+/);
      const amount = Math.round(Number(parts[0].replace(/[^\d.]/g, "")));
      const note = parts.slice(1).join(" ").trim();
      if (!Number.isFinite(amount) || amount <= 0) {
        await say(chatId, "الصيغة: <i>المبلغ ثم الوصف</i>\nمثال: <code>5000 مشتريات لحم</code>", [BACK]);
        return;
      }
      const CATS = ["مشتريات", "رواتب", "إيجار", "كهرباء", "صيانة"];
      const category = CATS.find((c) => note.includes(c)) ?? "أخرى";
      await restWrite("expenses", "POST", { amount, note: note || null, category, business_day: baghdadDay() });
      const t = sumRows(await summary(baghdadDay(), baghdadDay()));
      await say(
        chatId,
        `تم تسجيل المصروف ✅\n💸 <b>${fmt(amount)} د.ع</b>${note ? ` — ${esc(note)}` : ""} (${category})\n\n📉 مصروفات اليوم: <b>${fmt(t.e)} د.ع</b>\n✅ صافي اليوم: <b>${fmt(t.n)} د.ع</b>`,
        [[{ text: "📉 مصروف آخر", callback_data: "expadd" }], BACK],
      );
      return;
    }
    if (state.action === "add") {
      const parts = text.split(/\s+/);
      const price = Math.round(Number(parts[parts.length - 1]));
      const name = parts.slice(0, -1).join(" ").trim();
      if (!name || !Number.isFinite(price) || price <= 0) {
        await say(chatId, "الصيغة: <i>اسم المنتج ثم السعر</i>\nمثال: <code>موهيتو رمان 4000</code>", [BACK]);
        return;
      }
      await restWrite("menu_items", "POST", { category_id: state.categoryId, name_ar: name, price, cost: 0, is_active: true, sort: 99 });
      await say(chatId, `تمت إضافة <b>${esc(name)}</b> بسعر <b>${fmt(price)} د.ع</b> ✅`, await kbItems(state.categoryId));
      return;
    }
  }
  await say(chatId, "🍔 <b>ستيشن — لوحة التحكم</b>\nاختر من الأزرار:", mainMenu());
}

async function onCallback(cb: Row) {
  const chatId = cb.message.chat.id;
  const mid = cb.message.message_id;
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  if (!authorized(chatId)) return;
  await clearState(chatId);

  const [cmd, a, b] = String(cb.data).split("|");
  if (cmd === "menu") return say(chatId, "🍔 <b>ستيشن — لوحة التحكم</b>\nاختر من الأزرار:", mainMenu(), mid);
  if (cmd === "rpt") return say(chatId, await viewReport(Number(a)), [[{ text: "🔄 تحديث", callback_data: cb.data }], BACK], mid);
  if (cmd === "day") return say(chatId, await viewDaySummary(baghdadDay(-Number(a))), [[{ text: "🔄 تحديث", callback_data: cb.data }], BACK], mid);
  if (cmd === "dayx") return say(chatId, await viewDaySummary(a), [[{ text: "🔄 تحديث", callback_data: cb.data }], BACK], mid);
  if (cmd === "search") {
    await setState(chatId, { action: "searchdate" });
    return say(chatId, "🔎 أرسل التاريخ المطلوب:\nمثال: <code>2026-08-10</code> أو <code>10/08/2026</code>", [[{ text: "إلغاء", callback_data: "menu" }]], mid);
  }
  if (cmd === "now") return say(chatId, await viewNow(), [[{ text: "🔄 تحديث", callback_data: "now" }], BACK], mid);
  if (cmd === "tables") return say(chatId, await viewTables(), [[{ text: "🔄 تحديث", callback_data: "tables" }], BACK], mid);
  if (cmd === "final") return say(chatId, await viewDailyFinal(), [[{ text: "🔄 تحديث", callback_data: "final" }], BACK], mid);
  if (cmd === "drawer") return say(chatId, await viewDrawer(), [[{ text: "🔄 تحديث", callback_data: "drawer" }], BACK], mid);
  if (cmd === "sales") return say(chatId, await viewLastSales(), [[{ text: "🔄 تحديث", callback_data: "sales" }], BACK], mid);
  if (cmd === "pays") return say(chatId, await viewLastPayments(), [[{ text: "🔄 تحديث", callback_data: "pays" }], BACK], mid);
  if (cmd === "queue") return say(chatId, await viewQueue(), [[{ text: "🔄 تحديث", callback_data: "queue" }], BACK], mid);
  if (cmd === "stock") return say(chatId, await viewStock(), [[{ text: "🔄 تحديث", callback_data: "stock" }], BACK], mid);
  if (cmd === "short") return say(chatId, await viewShortages(), [[{ text: "🛒 قائمة المشتريات", callback_data: "po" }], BACK], mid);
  if (cmd === "po") return say(chatId, await viewPurchaseList(), [[{ text: "🔄 تحديث", callback_data: "po" }], BACK], mid);
  if (cmd === "prt") return say(chatId, await viewPartners(), kbPartners((await partnerBalances()) as Row[]), mid);
  if (cmd === "prtl") {
    const [p] = (await rest(`delivery_partners?id=eq.${a}&select=is_active`)) as Row[];
    return say(chatId, await viewPartnerLedger(a), kbLedger(a, !!p?.is_active), mid);
  }
  if (cmd === "prta") {
    await setState(chatId, { action: "partner" });
    return say(
      chatId,
      "🛵 أرسل اسم الشركة (ويمكن إضافة رقم الهاتف بعده)\nمثال: <code>كريم فود 07701234567</code>",
      [[{ text: "إلغاء", callback_data: "prt" }]],
      mid,
    );
  }
  if (cmd === "prtt") {
    const [p] = (await rest(`delivery_partners?id=eq.${a}&select=is_active,name_ar`)) as Row[];
    if (!p) return say(chatId, "الشركة غير موجودة.", [BACK], mid);
    // disabled, never deleted: a company with a year of orders behind it has to
    // keep resolving on old receipts and in old reports
    await restWrite(`delivery_partners?id=eq.${a}`, "PATCH", { is_active: !p.is_active });
    return say(chatId, await viewPartnerLedger(a), kbLedger(a, !p.is_active), mid);
  }
  if (cmd === "prts") {
    const [p] = (await rest(`delivery_partners?id=eq.${a}&select=name_ar`)) as Row[];
    await setState(chatId, { action: "settle", partnerId: a });
    return say(
      chatId,
      `💰 تسديد من <b>${esc(p?.name_ar ?? "")}</b>\nأرسل: <i>المبلغ ثم الوصف</i>\nمثال: <code>250000 حوالة</code>`,
      [[{ text: "إلغاء", callback_data: `prtl|${a}` }]],
      mid,
    );
  }
  if (cmd === "prep") return say(chatId, await viewQueue(), await kbPrep(), mid);
  if (cmd === "prepok") return say(chatId, await markReady(a), await kbPrep(), mid);
  if (cmd === "top") return say(chatId, await viewTop(), [BACK], mid);
  if (cmd === "counts") return say(chatId, await viewCounts(), [BACK], mid);
  if (cmd === "avail") return say(chatId, await viewAvail(), [BACK], mid);
  if (cmd === "expadd") {
    await setState(chatId, { action: "expense" });
    return say(chatId, "💸 أرسل: <i>المبلغ ثم الوصف</i>\nمثال: <code>5000 مشتريات لحم</code>", [[{ text: "إلغاء", callback_data: "menu" }]], mid);
  }
  if (cmd === "pcats") return say(chatId, "⚙️ <b>إدارة المنتجات</b> — اختر القسم:", await kbCategories(), mid);
  if (cmd === "pcat") return say(chatId, "اختر منتجاً لإدارته:", await kbItems(a), mid);
  if (cmd === "pitem") { const it = await oneItem(a); return say(chatId, itemText(it), kbItem(it), mid); }
  if (cmd === "ptog") {
    const it = await oneItem(a);
    await restWrite(`menu_items?id=eq.${a}`, "PATCH", { is_active: !it.is_active });
    const upd = await oneItem(a);
    return say(chatId, `${upd.is_active ? "تم التفعيل ✅" : "تم التعطيل ⛔"}\n\n${itemText(upd)}`, kbItem(upd), mid);
  }
  if (cmd === "pset") {
    await setState(chatId, { action: b, itemId: a });
    const it = await oneItem(a);
    return say(chatId, `أرسل ${b === "price" ? "السعر الجديد" : "الكلفة الجديدة"} لـ<b>${esc(it.name_ar)}</b> (رقم فقط):`, [[{ text: "إلغاء", callback_data: `pitem|${a}` }]], mid);
  }
  if (cmd === "padd") {
    await setState(chatId, { action: "add", categoryId: a });
    return say(chatId, "أرسل: <i>اسم المنتج ثم السعر</i>\nمثال: <code>موهيتو رمان 4000</code>", [[{ text: "إلغاء", callback_data: `pcat|${a}` }]], mid);
  }
  if (cmd === "pdel") {
    const it = await oneItem(a);
    return say(chatId, `حذف <b>${esc(it.name_ar)}</b> نهائياً؟`,
      [[{ text: "🗑️ نعم، احذف", callback_data: `pdelok|${a}` }, { text: "إلغاء", callback_data: `pitem|${a}` }]], mid);
  }
  if (cmd === "pdelok") {
    const it = await oneItem(a);
    await restWrite(`menu_items?id=eq.${a}`, "DELETE");
    return say(chatId, `تم حذف <b>${esc(it.name_ar)}</b> 🗑️`, await kbItems(it.category_id), mid);
  }
}

// ── entry ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // nightly (or manual) daily report — pg_cron calls this with the job secret
  if (url.searchParams.get("job") === "daily") {
    if (HOOK_SECRET && req.headers.get("x-job-secret") !== HOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    try {
      const text = await viewDailyFinal();
      for (const o of OWNERS) await say(o, text, [BACK]);
      return new Response("sent", { status: 200 });
    } catch (e) {
      return new Response(`error: ${(e as Error).message}`, { status: 500 });
    }
  }

  // telegram webhook updates
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  if (HOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== HOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const update = await req.json();
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message?.text) await onMessage(update.message);
  } catch (e) {
    console.error("update error:", (e as Error).message);
  }
  return new Response("ok", { status: 200 });
});
