import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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
