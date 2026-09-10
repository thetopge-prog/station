import {
  listExpenses,
  getRegisterClosures,
  getMonthlyCosts,
  listManualSales,
  listSuppliers,
  type ExpenseRow,
  type Supplier,
  type ManualSale,
  type RegisterClosure,
  type MonthlyCost,
} from "@/lib/cafe/expense-actions";
import { getStaff, requireRole } from "@/lib/cafe/auth";
import { isDemoServer } from "@/lib/cafe/demo";
import { ExpensesClient } from "@/components/cafe/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  if (!isDemoServer()) await requireRole("cashier");
  let expenses: ExpenseRow[] = [];
  let closures: { today: RegisterClosure | null; previous: RegisterClosure | null } = { today: null, previous: null };
  let monthlyCosts: MonthlyCost[] = [];
  let manualSales: ManualSale[] = [];
  let suppliers: Supplier[] = [];
  let isAdmin = false;
  try {
    if (!isDemoServer()) {
      const staff = await getStaff();
      isAdmin = staff?.isAdmin === true;
      // التكاليف الثابتة (إيجار · كهرباء · مولد · ماء) للإدارة وحدها.
      // كانت تُجلب دائماً وتُمرَّر إلى المكوّن، والمكوّن يُخفي المحرِّر خلف
      // isAdmin — لكن المبالغ نفسها كانت تُسلسَل داخل حمولة صفحة يفتحها
      // الكاشير. إخفاءٌ في الواجهة فوق بيانات مُرسَلة ليس إخفاءً.
      [expenses, closures, suppliers] = await Promise.all([listExpenses(), getRegisterClosures(), listSuppliers()]);
      if (isAdmin) [monthlyCosts, manualSales] = await Promise.all([getMonthlyCosts(), listManualSales()]);
    }
  } catch {
    // signed-out / demo — empty state
  }
  return <ExpensesClient expenses={expenses} closures={closures} monthlyCosts={monthlyCosts} isAdmin={isAdmin} manualSales={manualSales} suppliers={suppliers} />;
}
