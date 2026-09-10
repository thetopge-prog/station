import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s, error: se } = await anon.auth.signInWithPassword({ email: "07844446633@station.iq", password: process.argv[2] });
if (se) { console.log("signin error:", se.message); process.exit(0); }
console.log("signed in as", s.user.email);
const r = await anon.from("orders").select("id, order_seq, channel, subtotal, order_source, partner_id, partner_ref, partner_total").eq("status","pending").order("created_at",{ascending:true});
console.log("pending visible to this user:", r.error ? "ERR "+r.error.message : (r.data?.length ?? 0));
if (r.data?.length) console.log(JSON.stringify(r.data.slice(0,3)));
const dp = await anon.from("delivery_partners").select("id, settlement, delivery_fee").limit(3);
console.log("delivery_partners:", dp.error ? "ERR "+dp.error.message : JSON.stringify(dp.data));
