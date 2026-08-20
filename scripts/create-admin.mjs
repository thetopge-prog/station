// Creates the owner's admin login: a Supabase auth user + an `employees` row
// linked to the `admin` role, so is_admin() (and the whole app) recognises them.
// Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME + Supabase keys from .env.local,
// so no secret is ever passed on the command line.
//   Usage: node scripts/create-admin.mjs
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
  } catch {
    /* rely on the real environment */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "المدير";

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1. Find or create the auth user.
let userId;
{
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/registered|exists/i.test(error.message)) {
    console.error(`✗ createUser failed: ${error.message}`);
    process.exit(1);
  }
  userId = data?.user?.id;
  if (!userId) {
    // Already exists — look it up by listing (small user base).
    const { data: list } = await supabase.auth.admin.listUsers();
    userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  }
}
if (!userId) {
  console.error("✗ could not resolve the auth user id");
  process.exit(1);
}

// 2. Resolve the admin role.
const { data: role, error: roleErr } = await supabase
  .from("roles").select("id").eq("name_en", "admin").single();
if (roleErr || !role) {
  console.error("✗ admin role not found — apply 0003_seed.sql first");
  process.exit(1);
}

// 3. Upsert the employee row linked to this auth user.
const { data: existing } = await supabase
  .from("employees").select("id").eq("auth_user_id", userId).maybeSingle();
if (existing) {
  await supabase.from("employees").update({ role_id: role.id, is_active: true, name_ar: name }).eq("id", existing.id);
} else {
  const { error: insErr } = await supabase
    .from("employees").insert({ name_ar: name, role_id: role.id, auth_user_id: userId, is_active: true });
  if (insErr) {
    console.error(`✗ employee insert failed: ${insErr.message}`);
    process.exit(1);
  }
}

console.log(`✓ admin ready: ${email}`);
