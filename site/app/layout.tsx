import type { Metadata, Viewport } from "next";
import { Playfair_Display, Quicksand } from "next/font/google";
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
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c18" },
  ],
};

// Headings: Playfair Display (variable, 400 and up). UI and body: Quicksand (variable, 300-700).
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair" });
const quicksand = Quicksand({ subsets: ["latin"], variable: "--font-quicksand" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${playfair.variable} ${quicksand.variable}`}>
      <body className="font-sans text-[14px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
