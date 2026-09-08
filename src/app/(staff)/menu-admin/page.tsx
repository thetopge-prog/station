import { requireAdmin } from "@/lib/cafe/auth";
import { listMenuAdmin } from "@/lib/cafe/menu-admin-actions";
import { MenuAdminClient } from "@/components/cafe/MenuAdminClient";

export const dynamic = "force-dynamic";

// No try/catch around the read: requireAdmin is the gate, and a DB or env
// failure must reach the error boundary with its message — swallowed, it
// rendered «لا توجد بيانات» with no «صنف جديد» button and no way to tell why.
export default async function MenuAdminPage() {
  await requireAdmin();
  const categories = await listMenuAdmin();
  return <MenuAdminClient categories={categories} />;
}
