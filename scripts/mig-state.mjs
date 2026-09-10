import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pb = await db.from("partner_balances").select("*").limit(1);
console.log("0077 partner_balances delivery_fee:", pb.error ? "ERR "+pb.error.message : ("delivery_fee" in (pb.data?.[0] ?? {})));
const dp = await db.rpc("daily_partner_breakdown", { p_day: new Date().toISOString().slice(0,10) });
console.log("0077 breakdown partner_total:", dp.error ? "ERR "+dp.error.message : ("partner_total" in (dp.data?.[0] ?? {})));
const o = await db.from("orders").select("id,partner_ref,partner_total").eq("status","pending").limit(1);
console.log("0078 cols:", o.error ? "ERR "+o.error.message : "ok");
