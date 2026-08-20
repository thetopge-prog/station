import { requireRole } from "@/lib/cafe/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { KdsClient } from "@/components/cafe/KdsClient";

export const dynamic = "force-dynamic";

export default async function KdsPage() {
  const staff = await requireRole("chef", "expediter", "cashier");

  // A chef sees exactly their station. An unassigned chef (or a manager looking
  // in) sees everything rather than an empty screen they cannot explain.
  let stationName = "كل المحطات";
  if (staff.stationId) {
    const svc = createSupabaseServiceClient();
    const { data } = await svc.from("stations").select("name_ar").eq("id", staff.stationId).maybeSingle();
    stationName = data?.name_ar ?? stationName;
  }

  return <KdsClient stationId={staff.stationId} stationName={stationName} />;
}
