import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SITE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: { icon: "/brand/icon.svg" },
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION, locale: "en_MY" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c18" },
  ],
};

// One family everywhere: Inter (variable), the open-licence stand-in for SF Pro Display. Apple devices fall back to the real thing.
const inter = Inter({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-inter" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans text-[14px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
