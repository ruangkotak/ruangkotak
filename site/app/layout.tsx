import type { Metadata, Viewport } from "next";
import { Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RUANGKOTAK | Account diagnosis for creators",
  description:
    "Enter your TikTok or Instagram handle and see which of your videos work, which sink, and the one thing to fix first.",
  icons: { icon: "/brand/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1215" },
  ],
};

// Headings: Playfair Display Italic. Body: Satoshi Regular (Fontshare, self-hosted).
const playfair = Playfair_Display({ weight: "400", style: "italic", subsets: ["latin"], variable: "--font-playfair" });
const satoshi = localFont({ src: "./fonts/Satoshi-Regular.woff2", weight: "400", style: "normal", variable: "--font-satoshi" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${playfair.variable} ${satoshi.variable}`}>
      <body className="font-sans text-[15px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
