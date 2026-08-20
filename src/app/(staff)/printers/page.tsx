import { requireStaff } from "@/lib/cafe/auth";
import { listPrinters } from "@/lib/cafe/printer-actions";
import { PrintersClient } from "@/components/cafe/PrintersClient";

export const dynamic = "force-dynamic";

export default async function PrintersPage() {
  // Any staff member may LOOK (and run a test print — that is how you find out a
  // printer is out of paper). Only the owner may change wiring.
  const staff = await requireStaff();
  const printers = await listPrinters();
  return <PrintersClient printers={printers} isAdmin={staff.role === "admin"} />;
}
