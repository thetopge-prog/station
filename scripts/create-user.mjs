// Creates a staff login: auth user + linked employees row with a role.
// Logins without "@" become <login>@station.iq — this is how phone-number and
// username sign-in works (the sign-in form applies the same mapping).
//   Usage: node scripts/create-user.mjs <login> <password> <name_ar> <role> [station_en]
//   roles: admin | cashier | expediter | chef | cleaner
//   station_en (chefs only): pizza_oven | burger | grill | fryer
//   e.g.:  node scripts/create-user.mjs 07802525022 Secret123 "الإدارة" admin
//   e.g.:  node scripts/create-user.mjs 07701112233 Chef123 "علي" chef grill
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch { /* rely on env */ }
}
loadEnv();

const ROLES = ["admin", "cashier", "expediter", "chef", "cleaner"];
const [login, password, name, roleName, stationEn] = process.argv.slice(2);
if (!login || !password || !name || !ROLES.includes(roleName)) {
  console.error("usage: node scripts/create-user.mjs <login> <password> <name_ar> <role> [station_en]");
  console.error("  role:       " + ROLES.join(" | "));
  console.error("  station_en: pizza_oven | burger | grill | fryer   (chefs only)");
  process.exit(1);
}
const email = login.includes("@") ? login : `${login}@station.iq`;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1) auth user (find-or-create, then force the given password)
let userId;
{
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  userId = data?.user?.id;
  if (!userId) {
    if (error && !/registered|exists/i.test(error.message)) {
      console.error(`✗ createUser: ${error.message}`);
      process.exit(1);
    }
    const { data: list } = await supabase.auth.admin.listUsers();
    userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (userId) await supabase.auth.admin.updateUserById(userId, { password });
  }
}
if (!userId) { console.error("✗ could not resolve auth user"); process.exit(1); }

// 2) role
const { data: role } = await supabase.from("roles").select("id").eq("name_en", roleName).single();
if (!role) { console.error(`✗ role ${roleName} not found`); process.exit(1); }

// 2b) station — a chef's KDS shows only their own station, so it belongs on the
// account rather than being picked per shift like the expediter is.
let stationId = null;
if (stationEn) {
  const { data: st } = await supabase.from("stations").select("id").eq("name_en", stationEn).single();
  if (!st) { console.error(`✗ station ${stationEn} not found`); process.exit(1); }
  stationId = st.id;
}

// 3) employee row linked to the auth user
const { data: existing } = await supabase.from("employees").select("id").eq("auth_user_id", userId).maybeSingle();
if (existing) {
  await supabase.from("employees").update({ name_ar: name, role_id: role.id, station_id: stationId, is_active: true }).eq("id", existing.id);
} else {
  const { error } = await supabase.from("employees").insert({ name_ar: name, role_id: role.id, station_id: stationId, auth_user_id: userId, is_active: true });
  if (error) { console.error(`✗ employee insert: ${error.message}`); process.exit(1); }
}
console.log(`✓ ${roleName} ready: ${login} (${email})`);
