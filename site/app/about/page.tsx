import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { ABOUT_SECTIONS } from "@/lib/site";

export const metadata = {
  title: "About | RUANGKOTAK",
  description: "What RUANGKOTAK is, how a diagnosis works, who checks it, and what is free.",
  alternates: { canonical: "/about" },
};

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-[860px] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-12">
          <a href="/" aria-label="RUANGKOTAK home">
            <Logo className="h-[16px] w-auto" />
          </a>
        </div>
        <h1 className="text-4xl md:text-6xl">About RUANGKOTAK</h1>
        <div className="mt-10 grid gap-10">
          {ABOUT_SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="text-2xl">{s.h}</h2>
              {s.p.map((t) => (
                <p key={t} className="mt-3 max-w-[68ch] text-muted">
                  {t}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
