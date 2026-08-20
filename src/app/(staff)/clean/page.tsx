import { requireRole } from "@/lib/cafe/auth";
import { CleaningClient } from "@/components/cafe/CleaningClient";

export const dynamic = "force-dynamic";

export default async function CleanPage() {
  await requireRole("cleaner", "cashier");
  return <CleaningClient />;
}
