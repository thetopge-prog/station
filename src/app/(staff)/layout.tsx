import { redirect } from "next/navigation";
import { getStaff } from "@/lib/cafe/auth";
import { canAccess } from "@/lib/cafe/roles";
import { currentShiftLine } from "@/lib/cafe/session-actions";
import { isDemoServer } from "@/lib/cafe/demo";
import { getShiftWindows } from "@/lib/cafe/shift-window";
import { minutesToEnd, shiftAt } from "@/lib/cafe/work-shift";
import { StaffShell } from "@/components/cafe/StaffShell";

// Auth + role are resolved per request (runtime env, session cookie).
export const dynamic = "force-dynamic";

// Staff screens install as the separate «إدارة ستيشن» PWA (admin badge icon,
// opens on the dashboard) instead of the customer menu app.
export const metadata = { manifest: "/admin-manifest.webmanifest" };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const pushKey = process.env.WEB_PUSH_PUBLIC_KEY ?? null;
  // Never in production. isDemoServer() is just «NEXT_PUBLIC_SUPABASE_URL is
  // unset», read at RUNTIME — so a config slip on the host would otherwise hand
  // out an admin shell with no authentication at all. proxy.ts:73 already
  // fences its own dev bypass this way; this one did not.
  if (isDemoServer() && process.env.NODE_ENV !== "production") {
    // Demo trial (no Supabase configured): browsable shell, no real data.
    return (
      <StaffShell roles={["admin"]} name="وضع تجريبي" pushKey={pushKey}>
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
  const shift = canAccess(staff.roles, ["cashier"]) ? await currentShiftLine().catch(() => null) : null;
  // متى ينتهي دوام هذا الموظّف؟ لحظة مطلقة لا عدد دقائق: الصفحة قد تبقى
  // مفتوحة ساعتين، والعدد يتجمّد بينما الوقت لا يتجمّد.
  //
  // ومن بلا وردية (الحسابات المشتركة) يأخذ الوردية التي تقع فيها هذه اللحظة:
  // التحذير تذكيرٌ لا بوّابة، فلا معنى لحرمان من هو على الكاونتر فعلاً منه.
  let shiftEndsAt: string | null = null;
  try {
    const windows = await getShiftWindows();
    // لحظة واحدة تُقرأ مرّة: قراءتها مرّتين في العرض تجعل الناتج غير ثابت
    const at = new Date();
    const period = staff.shiftPeriod ?? shiftAt(at, windows);
    if (period) {
      const left = minutesToEnd(period, at, windows);
      if (left > 0) shiftEndsAt = new Date(at.getTime() + left * 60_000).toISOString();
    }
  } catch {
    /* تذكيرٌ لا أكثر — غيابه لا يمنع أحداً من العمل */
  }
  return (
    <StaffShell roles={staff.roles} name={staff.name} pushKey={pushKey} isDeveloper={staff.isDeveloper} shift={shift} shiftEndsAt={shiftEndsAt}>
      {children}
    </StaffShell>
  );
}
