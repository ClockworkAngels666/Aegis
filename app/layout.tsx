import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "./globals.css";

// Variable font (400-800): running text in Regular, every heading type in Bold.
// Cyrillic and Latin Extended cover buyer names such as "ООО Радиоавтоматика" and "Türkiye".
const garamond = EB_Garamond({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-garamond" });

const TITLE = "Aegis · Open-Source Trade Intelligence & Dual-Use Sanctions Radar";
const DESCRIPTION =
  "Screens buyers against sanctions lists and flags unusual EU exports of battlefield items through third countries.";
// Absolute URLs for the share image: the deployment's own address on Vercel, localhost otherwise
const SITE = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Aegis" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("h-full antialiased", garamond.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
