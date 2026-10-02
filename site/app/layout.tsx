import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";
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

// Headings: Fraunces (variable, optical size on) at 300. UI and body: IBM Plex Mono.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-fraunces" });
const plexMono = IBM_Plex_Mono({ weight: ["300", "400", "500"], subsets: ["latin"], variable: "--font-plex-mono" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${plexMono.variable}`}>
      <body className="font-sans text-[14px] leading-relaxed">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
