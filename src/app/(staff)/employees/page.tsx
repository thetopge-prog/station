import { listEmployees, type EmployeeRow } from "@/lib/cafe/employee-actions";
import { EmployeesClient } from "@/components/cafe/EmployeesClient";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  let employees: EmployeeRow[] = [];
  try {
    employees = await listEmployees();
  } catch {
    // demo mode / non-admin — empty state
  }
  return <EmployeesClient employees={employees} />;
}
