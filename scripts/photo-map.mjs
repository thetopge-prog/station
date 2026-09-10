import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) { const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await db.from("menu_public").select("category_name_ar,name_ar,image_url,description_ar,price").order("category_sort").order("sort");
const byCat = {};
for (const r of data ?? []) { const c = byCat[r.category_name_ar] ??= { n:0, photo:0, desc:0, names:[] }; c.n++; if (r.image_url) c.photo++; if (r.description_ar) c.desc++; if (!r.image_url) c.names.push(r.name_ar); }
for (const [k,v] of Object.entries(byCat)) console.log(`${k}: ${v.photo}/${v.n} photos, ${v.desc} desc — no photo: ${v.names.slice(0,4).join(" · ")}${v.names.length>4?" …":""}`);
