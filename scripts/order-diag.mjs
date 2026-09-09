import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = process.argv[2];
const o = await db.from("orders").select("order_seq,status,channel,order_source,subtotal,discount,extra,extra_note,partner_id,partner_ref,partner_total,partner_cash_received,partner_commission,payment_method,note,created_at").eq("id", id).maybeSingle();
console.log(JSON.stringify(o.data ?? o.error, null, 1));
const it = await db.from("order_items").select("name_snapshot,qty,unit_price,line_total,note,flavor").eq("order_id", id);
console.log(JSON.stringify(it.data ?? it.error, null, 1));
const al = await db.from("external_order_alerts").select("source,ref,title,body,unknown_items,created_at").eq("order_id", id).limit(2);
console.log("alerts:", JSON.stringify(al.data ?? al.error, null, 1));
