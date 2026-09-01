"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "./auth";

/**
 * قفل الشاشة — التحقّق في القاعدة لا في المتصفح.
 *
 * لو قارنّا الرمز في المتصفح لوجب إرساله إليه أولاً، ولقُرئ من مصدر الصفحة في
 * ثانية. فالرمز الصحيح لا يغادر القاعدة إطلاقاً؛ الذي يسافر هو المُدخَل، والذي
 * يعود «نعم» أو «لا».
 */
export async function unlockTill(pin: string): Promise<boolean> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_till_pin", { p_pin: pin.trim() });
  if (error) return false;
  return data === true;
}

export async function changeTillPin(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_till_pin", { p_current: current.trim(), p_next: next.trim() });
  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: "الرمز الحالي غير صحيح." };
  return { ok: true };
}
