"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { normaliseIraqiPhone } from "@/lib/brand";
import type { SiteLang } from "@/lib/site/copy";

/**
 * طلب وكالة من الصفحة التعريفية → صفٌّ في القاعدة ورسالة على تيليغرام للمالك.
 *
 * النموذج عام على الإنترنت، فثلاثة قيود: الهاتف عراقي (وهو المفتاح الذي
 * يُتواصل به)، والنصّ مقصوص، ورقم واحد لا يرسل أكثر من مرّة في الساعة — يكفي
 * بلا captcha تُتعب زبوناً حقيقياً.
 */
export type FranchiseResult = { ok: true } | { ok: false; field?: "name" | "city" | "phone"; error: "name" | "city" | "phone" | "generic" };

export async function submitFranchiseLead(input: {
  name: string;
  city: string;
  phone: string;
  note?: string;
  lang: SiteLang;
}): Promise<FranchiseResult> {
  const name = (input.name ?? "").trim().slice(0, 80);
  const city = (input.city ?? "").trim().slice(0, 60);
  const note = (input.note ?? "").trim().slice(0, 500) || null;
  const phone = normaliseIraqiPhone(input.phone ?? "");

  if (name.length < 2) return { ok: false, field: "name", error: "name" };
  if (city.length < 2) return { ok: false, field: "city", error: "city" };
  if (!phone) return { ok: false, field: "phone", error: "phone" };

  try {
    const svc = createSupabaseServiceClient();
    const { data: recent } = await svc
      .from("franchise_leads")
      .select("id")
      .eq("phone", phone)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
      .limit(1);
    // أرسل مرّتين؟ نقول «وصل» ولا نكرّر على المالك — لا نكشف الحدّ ولا نزعج المرسِل
    if (recent?.length) return { ok: true };

    const { error } = await svc.from("franchise_leads").insert({ name, city, phone, note, lang: input.lang });
    if (error) return { ok: false, error: "generic" };

    await tellOwner(`🤝 <b>طلب وكالة جديد</b>\n👤 ${esc(name)}\n🏙️ ${esc(city)}\n📞 <code>${esc(phone)}</code>${note ? `\n📝 ${esc(note)}` : ""}\n🌐 ${input.lang}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "generic" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tellOwner(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const owners = (process.env.TG_OWNER_IDS ?? process.env.TELEGRAM_OWNER_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !owners.length) return;
  await Promise.allSettled(
    owners.map((chat_id) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(5000),
      }),
    ),
  );
}
