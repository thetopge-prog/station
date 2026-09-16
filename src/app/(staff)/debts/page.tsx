import { requireRole } from "@/lib/cafe/auth";
import { listDebtors, getTotalOutstanding, type Debtor } from "@/lib/cafe/debt-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { DebtsClient } from "@/components/cafe/DebtsClient";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const staff = isDemoServer() ? null : await requireRole("cashier");
  const isAdmin = staff?.isAdmin ?? true;
  let debtors: Debtor[] = [];
  let outstanding: number | null = null;
  try {
    // الكاشير يسجّل ويسدّد على الكاونتر؛ مجموع الذمم كلّها رقم الإدارة
    if (!isDemoServer()) [debtors, outstanding] = await Promise.all([listDebtors(), isAdmin ? getTotalOutstanding() : Promise.resolve(null)]);
  } catch {
    // signed-out / demo — empty state
  }
  return <DebtsClient debtors={debtors} outstanding={outstanding} />;
}
