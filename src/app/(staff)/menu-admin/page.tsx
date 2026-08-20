import { listMenuAdmin, type AdminCategory } from "@/lib/cafe/menu-admin-actions";
import { MenuAdminClient } from "@/components/cafe/MenuAdminClient";

export const dynamic = "force-dynamic";

export default async function MenuAdminPage() {
  let categories: AdminCategory[] = [];
  try {
    categories = await listMenuAdmin();
  } catch {
    // demo mode / non-admin — empty state
  }
  return <MenuAdminClient categories={categories} />;
}
