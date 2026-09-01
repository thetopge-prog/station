import { requireAdmin } from "@/lib/cafe/auth";
import { listPartnerBalances, type PartnerBalance } from "@/lib/cafe/partner-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { PartnersClient } from "@/components/cafe/PartnersClient";

export const dynamic = "force-dynamic";

/** حسابات شركات التوصيل — admin only; the ledger carries order totals. */
export default async function PartnersPage() {
  if (!isDemoServer()) await requireAdmin();
  let partners: PartnerBalance[] = [];
  try {
    if (!isDemoServer()) partners = await listPartnerBalances();
  } catch {
    // not an admin, or signed out — empty state rather than a stack trace
  }
  return <PartnersClient partners={partners} />;
}
