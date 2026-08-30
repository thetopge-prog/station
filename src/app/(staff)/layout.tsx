import { redirect } from "next/navigation";
import { getStaff } from "@/lib/cafe/auth";
import { currentShiftLine } from "@/lib/cafe/session-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { StaffShell } from "@/components/cafe/StaffShell";

// Auth + role are resolved per request (runtime env, session cookie).
export const dynamic = "force-dynamic";

// Staff screens install as the separate «إدارة ستيشن» PWA (admin badge icon,
// opens on the dashboard) instead of the customer menu app.
export const metadata = { manifest: "/admin-manifest.webmanifest" };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const pushKey = process.env.WEB_PUSH_PUBLIC_KEY ?? null;
  if (isDemoServer()) {
    // Demo trial (no Supabase configured): browsable shell, no real data.
    return (
      <StaffShell role="admin" name="وضع تجريبي" pushKey={pushKey}>
        {children}
      </StaffShell>
    );
  }
  const staff = await getStaff();
  if (!staff) redirect("/sign-in");
  // The shift was visible on /cashier and nowhere else, so an owner on the
  // dashboard had no idea whether the till was even open — and a cashier who
  // wandered off the page lost sight of their own drawer. Resolved here, on a
  // getStaff() the layout already paid for, and passed down as a prop rather
  // than fetched again by a poll.
  const shift = staff.role === "cashier" || staff.role === "admin" ? await currentShiftLine().catch(() => null) : null;
  return (
    <StaffShell role={staff.role} name={staff.name} pushKey={pushKey} isDeveloper={staff.isDeveloper} shift={shift}>
      {children}
    </StaffShell>
  );
}
