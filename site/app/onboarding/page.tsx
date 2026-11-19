import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { OnboardingForm } from "@/components/onboarding-form";
import { RATE_CARD_FEE } from "@/lib/deals";

export const metadata = {
  title: "Work with @alanazizreview | RUANGKOTAK",
  description: "Brands: offer @alanazizreview a review or a job. Register, pick the kind of job, agree the fee, get invoiced.",
  alternates: { canonical: "/onboarding" },
};

const STEPS: [string, string][] = [
  ["Register", "Tell me who you are and how to reach you. Takes two minutes."],
  ["Category", "Pick the kind of job: paid review, gifted unit, loan, launch event and so on."],
  ["Fee", `My rate is RM${RATE_CARD_FEE} plus the review unit for one video on Instagram & TikTok. Gifted or loan? I'll still quote a fee.`],
  ["Invoice", "Once we agree, you get an invoice from RUANGKOTAK, due in 14 days. The video goes up as agreed."],
];

export default function Page() {
  return (
    <>
      <main className="mx-auto max-w-[1240px] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-12">
          <a href="/" aria-label="RUANGKOTAK home">
            <Logo className="h-[16px] w-auto" />
          </a>
        </div>
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
          <div>
            <p className="eyebrow">Brands</p>
            <h1 className="mt-5 text-4xl md:text-6xl">Work with @alanazizreview</h1>
            <p className="mt-6 max-w-[46ch] text-base text-muted">
              Got a mic, light, camera or phone you want reviewed? I test creator gear hands-on in my studio and post on Instagram &amp; TikTok.
            </p>
            <ol className="mt-10 grid gap-5">
              {STEPS.map(([h, b], i) => (
                <li key={h} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="num grid size-8 place-items-center border border-ink text-sm font-semibold">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{h}</p>
                    <p className="text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-[46ch] border-l-2 border-ink pl-4 text-sm text-muted">
              One honest rule: you can check facts and specs before anything goes up, but the verdict stays mine. Paid or not.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
