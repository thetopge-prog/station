import { requireRole } from "@/lib/cafe/auth";
import { TablesClient } from "@/components/cafe/TablesClient";

export const dynamic = "force-dynamic";

export default async function TablesPage() {
  await requireRole("cashier", "cleaner");
  return <TablesClient />;
}
