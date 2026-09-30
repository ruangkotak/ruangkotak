import fixture from "@/data/fixture.json";
import { ApplyForm } from "@/components/apply-form";
import { DiagnosisFilm } from "@/components/diagnosis-film";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { FullReport } from "@/components/full-report";
import { HeroTitle } from "@/components/hero-title";
import { Intro } from "@/components/intro";
import { INTRO_SCRIPT } from "@/components/intro-script";
import { KotakHero } from "@/components/kotak-hero";
import { Ladder } from "@/components/ladder";
import { Marquee } from "@/components/marquee";
import { Method } from "@/components/method";
import { Nav } from "@/components/nav";
import { PreviewFlow } from "@/components/preview-flow";
import { Problem } from "@/components/problem";
import { ScrollProgress } from "@/components/scroll-progress";
import { analyze } from "@/lib/analyze";
import { MOCK } from "@/lib/source";
import type { AccountData } from "@/lib/types";

// Showcase copy only: brands the sample account worked with are named in captions and in "weak" findings,
// so their names and tags are masked here, along with a nickname that points to the account owner.
const SCRUB: [RegExp, string][] = [
  [/\s*@\w+/g, ""],
  [/PROTON e\.MAS/g, "the brand's EV"],
  [/\b(TRAPO|Trapo|PROTON)\b/g, "[brand]"],
  [/\s*Okay cite dia macam ni\.\..*$/, "…"],
];
const scrub = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value), (_k, v) => (typeof v === "string" ? SCRUB.reduce((s, [re, to]) => s.replace(re, to), v) : v));

export default function Home() {
  // Showcase copy: the handle and post links never leave the server, so the username can't be read from the page.
  const full = scrub(analyze("sample", fixture as AccountData, MOCK));
  const sample = { ...full, handle: "", videos: full.videos.map(({ url: _url, ...v }) => v) };
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <Intro />
      <ScrollProgress />
      <Nav />
      <main id="top">
        <section className="mx-auto grid min-h-[100dvh] max-w-[1240px] items-center gap-14 px-4 pt-24 pb-16 md:grid-cols-[1.05fr_1fr] md:px-8">
          <div>
            <HeroTitle />
            <p className="rise mt-5 max-w-[44ch] text-lg text-muted" style={{ "--d": "0.12s" } as React.CSSProperties}>
              Enter your TikTok or Instagram handle. We read your latest 18 videos and show you what is working, free.
            </p>
            <PreviewFlow />
          </div>
          <KotakHero />
        </section>
        <Problem />
        <DiagnosisFilm />
        <Marquee
          baseVelocity={-0.8}
          items={[
            "Food", "Beauty", "Fashion", "Fitness", "Health", "Travel", "Tech", "Gaming", "Automotive", "Comedy",
            "Music", "Dance", "Education", "Finance", "Business", "Parenting", "Pets", "Sports", "Lifestyle", "Home & DIY", "Art", "Religion",
          ]}
        />
        <Method report={sample} />
        <Ladder />
        <FullReport report={sample} />
        <ApplyForm />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
