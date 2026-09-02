import { getStaff } from "@/lib/cafe/auth";
import { isDemoServer } from "@/lib/cafe/demo";
import { HelpClient } from "@/components/cafe/HelpClient";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  let isAdmin = false;
  try {
    if (!isDemoServer()) {
      const staff = await getStaff();
      isAdmin = staff?.isAdmin === true;
    } else {
      isAdmin = true;
    }
  } catch {
    // signed-out — default to cashier view
  }
  return <HelpClient isAdmin={isAdmin} />;
}
