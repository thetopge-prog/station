import type { Metadata, Viewport } from "next";
import { Tajawal, Pacifico } from "next/font/google";
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

export const metadata: Metadata = {
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
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${pacifico.variable} h-full antialiased`}>
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
