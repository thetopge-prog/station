import { requireRole } from "@/lib/cafe/auth";
import { listDebtors, getTotalOutstanding, type Debtor } from "@/lib/cafe/debt-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { DebtsClient } from "@/components/cafe/DebtsClient";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  if (!isDemoServer()) await requireRole("cashier");
  let debtors: Debtor[] = [];
  let outstanding = 0;
  try {
    if (!isDemoServer()) [debtors, outstanding] = await Promise.all([listDebtors(), getTotalOutstanding()]);
  } catch {
    // signed-out / demo — empty state
  }
  return <DebtsClient debtors={debtors} outstanding={outstanding} />;
}
