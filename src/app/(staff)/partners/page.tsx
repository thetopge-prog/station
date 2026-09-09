import { requireAdmin } from "@/lib/cafe/auth";
import { listPartnerBalances, type PartnerBalance } from "@/lib/cafe/partner-actions";
import { listMenuAdmin, type AdminCategory } from "@/lib/cafe/menu-admin-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { PartnersClient } from "@/components/cafe/PartnersClient";

export const dynamic = "force-dynamic";

/** حسابات شركات التوصيل — admin only; the ledger carries order totals.
 *  The menu rides along for the alias table («أسماء الأصناف عند الشركة»). */
export default async function PartnersPage() {
  if (!isDemoServer()) await requireAdmin();
  let partners: PartnerBalance[] = [];
  let menu: AdminCategory[] = [];
  try {
    if (!isDemoServer()) [partners, menu] = await Promise.all([listPartnerBalances(), listMenuAdmin()]);
  } catch {
    // not an admin, or signed out — empty state rather than a stack trace
  }
  return <PartnersClient partners={partners} menu={menu} />;
}
