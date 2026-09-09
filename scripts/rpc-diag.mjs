import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: z } = await db.from("delivery_partners").select("id,name_ar,settlement,commission_pct").ilike("name_ar","%زاد%").maybeSingle();
console.log("zad:", z);
// same shape the screen sends; is_admin() is false for service role so we expect 'admin only' if the overload resolves
const r = await db.rpc("save_partner", { p_id: z?.id ?? null, p_name: "زاد", p_phone: null, p_active: true, p_note: null });
console.log("rpc:", r.error ? r.error.message : r.data);
const c = await db.from("delivery_partners").update({ settlement: "custom" }).eq("id", z?.id).select("settlement");
console.log("patch custom:", c.error ? c.error.message : c.data);
