import { requireAdmin } from "@/lib/cafe/auth";
import { listAttendance, listShiftStaff } from "@/lib/cafe/attendance-actions";
import { workDay } from "@/lib/cafe/work-shift";
import { AttendanceClient } from "@/components/cafe/AttendanceClient";

/**
 * /attendance — جدول الدخول والانصراف.
 *
 * للإدارة: من حضر، ومتى، وكم تأخّر، ومن ما زال بالداخل. والحضور نفسه يُسجَّل
 * تلقائياً مع الدخول، فلا زرّ هنا يفتح حضوراً — الصفحة تقرأ وتُقفل وتستثني.
 */
export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireAdmin();
  const { day } = await searchParams;
  const on = day || workDay();
  const [rows, staff] = await Promise.all([listAttendance(on), listShiftStaff()]);
  return <AttendanceClient rows={rows} staff={staff} day={on} />;
}
