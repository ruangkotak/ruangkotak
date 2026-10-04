import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";

// Hidden page: not linked from the site, not in the sitemap, noindex. Source lives in /showreel at the repo root.
export const metadata: Metadata = {
  title: "Showreel | RUANGKOTAK",
  description: "Fifteen seconds on what burns creators out, and what a diagnosis changes.",
  robots: { index: false, follow: false },
};

const FORMATS = [
  { id: "landscape", label: "16:9", w: 1920, h: 1080, show: "hidden md:block" },
  { id: "vertical", label: "9:16", w: 1080, h: 1920, show: "md:hidden mx-auto max-w-[420px]" },
];

export default function ShowreelPage() {
  return (
    <>
      <main className="mx-auto max-w-[1240px] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-10 flex items-center justify-between">
          <a href="/" aria-label="RUANGKOTAK home">
            <Logo className="h-[16px] w-auto" />
          </a>
        </div>
        <h1 className="text-4xl md:text-6xl">Showreel</h1>
        <p className="mt-3 max-w-[60ch] text-muted">
          Ideas, strategy, execution: three jobs, one creator, one battery. Fifteen seconds on what burns creators out and
          what a diagnosis changes. Every frame is drawn in code and every sound is cut to the frame.
        </p>
        {FORMATS.map((f) => (
          <video
            key={f.id}
            className={`mt-10 w-full rounded-lg border border-line bg-surface ${f.show}`}
            width={f.w}
            height={f.h}
            poster={`/showreel/poster-${f.id}.jpg`}
            controls
            playsInline
            preload="none"
          >
            <source src={`/showreel/showreel-${f.id}.mp4`} type="video/mp4" />
          </video>
        ))}
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {FORMATS.map((f) => (
            <a key={f.id} href={`/showreel/showreel-${f.id}.mp4`} download className="underline underline-offset-4 hover:text-ink">
              Download {f.label}
            </a>
          ))}
        </p>
      </main>
      <Footer />
    </>
  );
}
