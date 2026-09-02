import { requireDeveloper } from "@/lib/cafe/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { SetupClient, type SetupPrinter } from "@/components/cafe/SetupClient";

/**
 * /setup — التركيب.
 *
 * كانت سبع خطوات: مفتاح الشاشة، ورموز QR، وحسابات الدخول، وتعليمات ماكرودرويد،
 * وسرّ الويبهوك مكتوباً صريحاً على الشاشة، وقائمة فحص من أحد عشر بنداً. وكل ذلك
 * صار منجزاً أو انتقل إلى مكانه الصحيح — لم يبقَ من التركيب إلا الطابعات.
 *
 * فصارت الصفحة أزراراً: طابعة، طابعة، طابعة، ودرج. والأزرار تُبنى من جدول
 * printers نفسه لا من أسماء مكتوبة هنا، فما تراه هو ما في المحل مهما تغيّر.
 */
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requireDeveloper();
  const svc = createSupabaseServiceClient();
  const { data } = await svc
    .from("printers")
    .select("id, name_ar, kind, share, host, is_active, sort, stations(name_ar)")
    .order("sort");

  const rows = (data ?? []) as unknown as (SetupPrinter & { stations: { name_ar: string } | null })[];
  const printers: SetupPrinter[] = rows.map((p) => ({
    id: p.id,
    name_ar: p.name_ar,
    kind: p.kind,
    station_name: p.stations?.name_ar ?? null,
    share: p.share,
    host: p.host,
    is_active: p.is_active,
  }));

  return <SetupClient printers={printers} />;
}
