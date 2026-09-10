import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await db.from("menu_public").select("name_ar,image_url");
const withImg = (data ?? []).filter(r => r.image_url);
console.log("items:", data?.length, "with image:", withImg.length);
console.log(withImg.slice(0,3).map(r => r.image_url));
