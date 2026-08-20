import { requireRole } from "@/lib/cafe/auth";
import { InventoryClient } from "@/components/cafe/InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  // chefs receive deliveries and record waste; only the owner retunes thresholds
  const staff = await requireRole("chef", "cashier", "expediter");
  return <InventoryClient isAdmin={staff.role === "admin"} />;
}
