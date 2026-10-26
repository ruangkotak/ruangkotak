import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { CONTACT_SECTIONS } from "@/lib/site";

export const metadata = {
  title: "Contact | RUANGKOTAK",
  description: "How to reach RUANGKOTAK about a diagnosis, the monthly service, or your personal data.",
  alternates: { canonical: "/contact" },
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
        <h1 className="text-4xl md:text-6xl">Contact RUANGKOTAK</h1>
        <div className="mt-10 grid gap-10">
          {CONTACT_SECTIONS.map((s) => (
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
