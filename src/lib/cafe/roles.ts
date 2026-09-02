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
 * Can this person reach a screen? The owner passes every gate — a manager
 * standing at the expediter station during a rush must never be locked out.
 *
 * Takes a LIST now, because one person can hold two jobs: عمر محمد is a cashier
 * and an expediter. Before this the only ways to express that were to overload
 * `cashier` until it meant "cashier plus whatever the floor needs" — which is
 * why cashier appears in almost every kitchen screen's allowlist — or to make
 * him an admin, which hands over the profit, the wages and the menu because he
 * also bags orders.
 *
 * A bare role is still accepted so the fifteen callers that pass one keep
 * working while they are converted.
 */
export function canAccess(roles: StaffRole[] | StaffRole | null, allowed: StaffRole[]): boolean {
  const mine = roles === null ? [] : Array.isArray(roles) ? roles : [roles];
  return mine.includes("admin") || mine.some((r) => allowed.includes(r));
}
