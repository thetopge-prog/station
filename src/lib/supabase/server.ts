import { cookies } from "next/headers";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { AUTH_STORAGE_KEY, getSupabaseEnv, parseSessionCookie } from "./constants";

/**
 * Server-side Supabase client for RSC / route handlers. Reads the session from
 * the request cookie (set by the browser client) and forwards the access token
 * so PostgREST applies the correct row-level-security context. Never writes
 * cookies (RSC cannot); token refresh happens on the browser.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(AUTH_STORAGE_KEY)?.value);

  // Never forward an EXPIRED access token: PostgREST would reject the whole
  // request (401) and a stale-cookie visitor would see less than an anonymous
  // one (e.g. an empty public menu). Fall back to anon; the browser client
  // refreshes the token and later requests carry a fresh one.
  const expired = session?.expiresAt != null && session.expiresAt * 1000 < Date.now();
  const usable = session && !expired ? session : null;

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: usable
      ? { headers: { Authorization: `Bearer ${usable.accessToken}` } }
      : undefined,
  });
}

/**
 * SERVICE-ROLE client — BYPASSES row-level security. SERVER ONLY. This is the
 * single privileged path in the app: it is the ONLY way cost/profit columns and
 * the loyalty/summary rpc are reached (they are revoked from anon+authenticated
 * at the database). Every caller must run its own admin/staff gate first, and
 * results carrying cost/profit must never be returned raw to an unprivileged UI.
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> {
  const { url } = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — privileged access requires it.");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * The raw access token on this request, if any.
 *
 * The hub needs it as a cache key for the offline identity it remembers, and
 * nothing else should: it is a live credential, so it is read here rather than
 * passed around.
 */
export async function currentAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseSessionCookie(cookieStore.get(AUTH_STORAGE_KEY)?.value)?.accessToken ?? null;
}

/**
 * هل رفض خادم المصادقة هذا الرمز فعلاً، أم أنّنا لم نصل إليه؟
 *
 * الفرق بينهما هو الفرق بين «انتهت جلستك» و«الشبكة تعثّرت لحظة» — وكانا
 * يُعامَلان سواءً: أي فشلٍ يُقرأ «غير مسجَّل»، فيُطرد موظّفٌ رمزُه سليم لأن
 * طلباً واحداً تأخّر.
 *
 * والرفض وحده يحمل رمز حالة ٤٠١ أو ٤٠٣. أما انقطاع الشبكة ومهلة الاتصال
 * وخطأ الخادم ٥٠٠ فلا تقول شيئاً عن الجلسة.
 */
export function isAuthRejection(error: { status?: number } | null | undefined): boolean {
  const st = error?.status;
  return st === 401 || st === 403;
}

/**
 * Returns the authenticated user (validated against Supabase Auth) or null.
 *
 * وقاعدة البيانات في طوكيو — الرحلة منها إلى الرمادي ~٣٢٠ مللي ثانية كما يقول
 * تعليق `auth.ts` — فعثرةٌ واحدة واردة. ولذلك تُعاد المحاولة مرّةً حين لا يكون
 * الفشل رفضاً: محاولةٌ ثانية أرخص من طرد كاشيرٍ أمام زبون.
 */
export async function getServerUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(AUTH_STORAGE_KEY)?.value);
  if (!session) return null;

  const ask = async () => {
    const { url, anonKey } = getSupabaseEnv();
    const supabase = createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return supabase.auth.getUser(session.accessToken);
  };

  try {
    const { data, error } = await ask();
    if (!error) return data.user;
    // رفضٌ صريح: الجلسة انتهت أو أُبطلت، ولا تُعاد المحاولة
    if (isAuthRejection(error)) return null;
    const again = await ask();
    return again.error ? null : again.data.user;
  } catch {
    // لم يخرج الطلب أصلاً — عثرةُ شبكة. محاولةٌ واحدة ثم نستسلم
    try {
      const again = await ask();
      return again.error ? null : again.data.user;
    } catch {
      return null;
    }
  }
}
