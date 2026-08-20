import { requireRole } from "@/lib/cafe/auth";
import { ExpediterClient } from "@/components/cafe/ExpediterClient";

export const dynamic = "force-dynamic";

export default async function ExpediterPage() {
  const staff = await requireRole("expediter", "cashier");
  return <ExpediterClient name={staff.name} />;
}
