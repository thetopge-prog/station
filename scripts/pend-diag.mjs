import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log("now UTC:", new Date().toISOString());
const p = await db.from("orders").select("order_seq,status,order_source,partner_ref,subtotal,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(10);
console.log("pending:", JSON.stringify(p.data ?? p.error));
const a = await db.from("external_order_alerts").select("id,source,ref,title,body,order_id,handled_at,created_at").order("created_at",{ascending:false}).limit(4);
console.log("alerts:", JSON.stringify(a.data ?? a.error, null, 1));
const o = await db.from("orders").select("order_seq,status,order_source,created_at").eq("partner_ref","92617-77273");
console.log("order 617:", JSON.stringify(o.data ?? o.error));
