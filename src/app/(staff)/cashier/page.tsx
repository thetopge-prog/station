import { getPublicMenu } from "@/lib/cafe/menu-data";
import { requireStaff } from "@/lib/cafe/auth";
import { currentExpediterName } from "@/lib/cafe/shift-actions";
import { getActiveTableNames } from "@/lib/cafe/table-actions";
import { DEFAULT_TABLES } from "@/lib/cafe/tables";
import { CashierClient } from "@/components/cafe/CashierClient";
import { CashierSessionGate } from "@/components/cafe/CashierSessionGate";

export const dynamic = "force-dynamic";

export default async function CashierPage() {
  // demo mode (no session) throws in getActiveTableNames → fall back to defaults so dine-in still works
  const [menu, tables, staff, expediter] = await Promise.all([
    getPublicMenu(),
    getActiveTableNames().catch(() => DEFAULT_TABLES),
    requireStaff(),
    // «اسم المجهّز» on the receipt comes from the open shift, not from a
    // per-order guess — see shift-actions
    currentExpediterName().catch(() => null),
  ]);

  // The gate owns whether the till may open at all: an unaccepted drawer or a
  // missing opening float replaces the POS entirely rather than warning beside it.
  return (
    <CashierSessionGate>
      <CashierClient menu={menu} tables={tables} cashierName={staff.name} expediterName={expediter} />
    </CashierSessionGate>
  );
}
