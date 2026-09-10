import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await db.from("webhook_log").select("at,body").eq("route","/api/orders/external").order("id",{ascending:false}).limit(1);
const b = JSON.parse(data[0].body);
console.log("--- text ---");
console.log(b.text);
console.log("--- lines ---");
console.log(JSON.stringify(b.lines));
