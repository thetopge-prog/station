import {
  listExpenses,
  getRegisterClosures,
  getMonthlyCosts,
  type ExpenseRow,
  type RegisterClosure,
  type MonthlyCost,
} from "@/lib/cafe/expense-actions";
import { getStaff } from "@/lib/cafe/auth";
import { isDemoServer } from "@/lib/cafe/demo";
import { ExpensesClient } from "@/components/cafe/ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  let expenses: ExpenseRow[] = [];
  let closures: { today: RegisterClosure | null; previous: RegisterClosure | null } = { today: null, previous: null };
  let monthlyCosts: MonthlyCost[] = [];
  let isAdmin = false;
  try {
    if (!isDemoServer()) {
      const staff = await getStaff();
      isAdmin = staff?.role === "admin";
      [expenses, closures, monthlyCosts] = await Promise.all([listExpenses(), getRegisterClosures(), getMonthlyCosts()]);
    }
  } catch {
    // signed-out / demo — empty state
  }
  return <ExpensesClient expenses={expenses} closures={closures} monthlyCosts={monthlyCosts} isAdmin={isAdmin} />;
}
