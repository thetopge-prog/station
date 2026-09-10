import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const wl = await db.from("webhook_log").select("at,route,status,note,body").order("id",{ascending:false}).limit(14);
console.log("== webhook_log ==");
for (const r of wl.data ?? []) console.log(r.at, "|", r.route, r.status, "|", r.note, "|", String(r.body ?? "").slice(0,150).replace(/\s+/g," "));
const al = await db.from("external_order_alerts").select("source,ref,title,body,unknown_items,order_id,created_at").order("created_at",{ascending:false}).limit(6);
console.log("== alerts ==", JSON.stringify(al.data ?? al.error, null, 1));
const o = await db.from("orders").select("order_seq,status,order_source,partner_ref,partner_total,subtotal,created_at").in("order_source",["toters","talabaty"]).order("created_at",{ascending:false}).limit(5);
console.log("== external orders ==", JSON.stringify(o.data ?? o.error));
