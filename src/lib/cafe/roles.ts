/**
 * Job types, shared by client and server.
 *
 * Kept out of auth.ts on purpose: that module imports the Supabase service
 * client, so anything a client component needs (the nav allowlist, a role
 * label) has to live here or it drags server-only code into the browser bundle.
 *
 * Station runs 8 accounts across 4 job types — 2 cashiers, 2 expediters,
 * 2 chefs, 2 cleaners — plus the owner. Roles are ROWS in public.roles, so a
 * ninth person is a data insert; only this union knows about job types at all.
 */
export const STAFF_ROLES = ["admin", "cashier", "expediter", "chef", "cleaner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_AR: Record<StaffRole, string> = {
  admin: "مدير",
  cashier: "كاشير",
  expediter: "مجهّز طلبات",
  chef: "طبّاخ",
  cleaner: "تنظيف الطاولات",
};

export function toRole(nameEn: string | null | undefined): StaffRole | null {
  return STAFF_ROLES.includes(nameEn as StaffRole) ? (nameEn as StaffRole) : null;
}

/**
 * Can this role reach a screen? The owner passes every gate — a manager
 * standing at the expediter station during a rush must never be locked out.
 */
export function canAccess(role: StaffRole | null, allowed: StaffRole[]): boolean {
  return role === "admin" || (!!role && allowed.includes(role));
}
