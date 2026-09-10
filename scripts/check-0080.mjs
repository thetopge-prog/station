import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const w = await db.from("shift_windows").select("*");
console.log("0080 shift_windows:", w.error ? "ERR "+w.error.message : JSON.stringify(w.data));
const s = await db.from("suppliers").select("id").limit(1);
console.log("0081 suppliers:", s.error ? "ERR "+s.error.message : "ok ("+(s.data?.length??0)+" rows)");
const e = await db.from("expenses").select("supplier_id").limit(1);
console.log("0081 expenses.supplier_id:", e.error ? "ERR "+e.error.message : "ok");
const l = await db.rpc("partner_ledger", { p_partner: "00000000-0000-0000-0000-000000000000" });
console.log("0077 partner_ledger:", l.error ? "ERR "+l.error.message : "ok");
