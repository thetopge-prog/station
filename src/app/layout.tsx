import type { Metadata, Viewport } from "next";
import { Tajawal, Pacifico, Noto_Kufi_Arabic } from "next/font/google";
import "./globals.css";
import { CafeUIProvider } from "@/components/CafeUIProvider";
import { RegisterSW } from "@/components/RegisterSW";
import { getPublicSupabaseConfig } from "@/lib/supabase/constants";
import { BRAND, BRAND_TITLE } from "@/lib/brand";

const tajawal = Tajawal({
  subsets: ["arabic"],
  // 900 carries the heavy, playful headline weight of the Station ad set
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
  display: "swap",
});

// The script wordmark from the packaging. Latin only — Pacifico has no Arabic
// glyphs, so it is applied per-element via .station-script, never to body.
const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pacifico",
  display: "swap",
});

/**
 * الخطّ الكردي — للصفحة الكردية وحدها.
 *
 * Tajawal خطٌّ عربيٌّ لاتيني، وقياسُ الرسوم في المتصفّح أثبت أنه لا يملك
 * ک گ ە ڕ ڵ ۆ ێ چ ژ — وهي في كل كلمة سورانية تقريباً. فكان المتصفّح يسقط
 * بها **حرفاً حرفاً** إلى خطّ النظام بوزن آخر ووصلٍ مكسور، وهو ما رآه المالك.
 * Noto Kufi Arabic يغطّيها كلّها (مقيسةً كذلك)، ويُحمَّل على `/ku` فقط:
 * بقيّة النظام عربية ولا سبب لتحميل خطّ ثانٍ لها.
 */
const kurdish = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800", "900"],
  variable: "--font-kurdish",
  display: "swap",
});

export const metadata: Metadata = {
  // og:image لا بدّ أن يكون رابطاً كاملاً وإلا تجاهله واتساب
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://stationiraq.com"),
  title: BRAND_TITLE,
  description: `منيو ${BRAND.nameAr} ونظام الطلبات — ${BRAND.cityAr}.`,
  manifest: "/manifest.webmanifest",
  // favicon comes from src/app/icon.png (Next serves it automatically)
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: BRAND.nameAr,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND.themeColor,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Public Supabase config, read at RUNTIME and injected so the browser gets it
  // even when NEXT_PUBLIC_* were not baked at build time (Netlify/VPS deploys).
  // These are public values (anon key + URL) — safe to embed in the HTML.
  const publicEnv = getPublicSupabaseConfig();
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${pacifico.variable} ${kurdish.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ENV__=${JSON.stringify({
              supabaseUrl: publicEnv?.url ?? "",
              supabaseAnonKey: publicEnv?.anonKey ?? "",
            })}`,
          }}
        />
        <RegisterSW />
        <CafeUIProvider>{children}</CafeUIProvider>
      </body>
    </html>
  );
}
