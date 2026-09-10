/**
 * صورة الصنف: من رابط التخزين إلى مسار من أصلنا.
 *
 * كانت هذه الدالة مكرّرة في ثلاثة ملفات بثلاثة أشكال. صيغة واحدة هنا يستعملها
 * المنيو وشاشة ‎/order‎ — والكشك حين يُوحَّد.
 *
 * ‎/img/*‎ يُعاد توجيهه عند الحافة إلى تخزين Supabase (netlify.toml) فتُخدَم
 * الصورة من نقطة قريبة من العراق لا من سيدني. والنسخة ‎-sm‎ للقوائم، والكاملة
 * للورقة المكبَّرة.
 */
export type ImgSrcs = { sm: string; full: string };

export function imgSrcs(url: string | null | undefined): ImgSrcs | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/menu\/(.+)$/);
  const full = m ? `/img/${m[1]}` : url;
  return { sm: full.replace(/\.webp(\?|$)/, "-sm.webp$1"), full };
}

/** الصغيرة غائبة؟ جرّب الكاملة. غابت الاثنتان؟ أخفِ الصورة ودع الخلفية تظهر. */
export function onImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const full = img.dataset.full;
  if (full && !img.src.endsWith(full)) img.src = full;
  else img.style.display = "none";
}
