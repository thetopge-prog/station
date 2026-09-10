import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const p = await db.from("delivery_partners").select("name_ar,settlement,commission_pct,delivery_fee");
console.log("0076/0077 partners:", JSON.stringify(p.data ?? p.error));
const z = (p.data ?? []).find(x => x.name_ar.includes("زاد"));
if (z) { const l = await db.rpc("partner_ledger", { p_partner: (await db.from("delivery_partners").select("id").eq("name_ar", z.name_ar).single()).data.id });
  console.log("ledger cols:", l.error ? l.error.message : Object.keys(l.data?.[0] ?? {}).join(",") || "(no rows)"); }
