import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local","utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g,"");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const wl = await db.from("webhook_log").select("status,note,created_at").order("id",{ascending:false}).limit(12);
console.log("== webhook_log ==");
if (wl.error) console.log("ERR", wl.error.message);
else for (const r of wl.data) console.log(r.created_at, "|", r.status, "|", r.note);
const bs = await db.from("bot_state").select("chat_id,updated_at").order("updated_at",{ascending:false}).limit(8);
console.log("== bot_state ==");
if (bs.error) console.log("ERR", bs.error.message);
else for (const r of bs.data) console.log(r.chat_id, "|", r.updated_at);
