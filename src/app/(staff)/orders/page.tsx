import { requireRole } from "@/lib/cafe/auth";
import { IncomingOrdersClient } from "@/components/cafe/IncomingOrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireRole("cashier", "expediter");
  return <IncomingOrdersClient />;
}
