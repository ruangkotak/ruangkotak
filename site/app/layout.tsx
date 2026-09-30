import type { Metadata, Viewport } from "next";
import { Playfair_Display } from "next/font/google";
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

// Headings only. Body text is SF Pro via the system stack in globals.css: Apple's licence doesn't allow serving SF Pro as a web font.
const playfair = Playfair_Display({ weight: "700", style: "italic", subsets: ["latin"], variable: "--font-playfair" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={playfair.variable}>
      <body className="font-sans text-[15px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
