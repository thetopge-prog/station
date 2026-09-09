import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const e = await db.from("employees").select("id,name_ar,auth_user_id,is_active,is_developer,roles!employees_role_id_fkey(name_en)").limit(20);
console.log("employees:", JSON.stringify(e.data ?? e.error));
const o = await db.from("orders").select("order_seq,channel,cashier_id,created_at").eq("business_day", new Date().toISOString().slice(0,10)).order("order_seq",{ascending:false}).limit(8);
console.log("today orders:", JSON.stringify(o.data ?? o.error));
const { data: users } = await db.auth.admin.listUsers({ perPage: 20 });
console.log("auth users:", JSON.stringify((users?.users ?? []).map(u => ({ id: u.id, email: u.email, role: u.app_metadata?.role ?? u.user_metadata?.role }))));
