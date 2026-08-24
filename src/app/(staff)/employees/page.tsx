import { listEmployees, type EmployeeRow } from "@/lib/cafe/employee-actions";
import { listAccounts, type AccountRow } from "@/lib/cafe/account-actions";
import { EmployeesClient } from "@/components/cafe/EmployeesClient";
import { AccountsClient } from "@/components/cafe/AccountsClient";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  let employees: EmployeeRow[] = [];
  let accounts: AccountRow[] = [];
  try {
    [employees, accounts] = await Promise.all([listEmployees(), listAccounts()]);
  } catch {
    // demo mode / non-admin — empty state
  }
  return (
    <div className="space-y-10">
      <EmployeesClient employees={employees} />
      {/* Logins live next to the people they belong to: hiring someone and
          giving them a way in is one errand, not two pages. */}
      <AccountsClient accounts={accounts} />
    </div>
  );
}
