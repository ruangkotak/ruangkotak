import { Plus } from "@phosphor-icons/react/dist/ssr";

const QA = [
  ["Do you need my password?", "No. We only read what is public on your profile: videos, captions, views and dates."],
  ["Which accounts can you check?", "Public TikTok and Instagram accounts. Private accounts cannot be read."],
  ["Why are my captions not translated?", "Because they are yours. The report keeps your exact words, so you can find every video it talks about."],
  ["How much is monthly?", "It depends on your account and goals. Apply and you get a quote, with no obligation."],
  [
    "Who writes the findings?",
    "The numbers are calculated from your data. The mini-diagnosis findings are written with AI. Monthly reports are checked by a person before you see them.",
  ],
];

export function Faq() {
  return (
    <section className="mx-auto grid max-w-[1240px] gap-10 px-4 pb-24 md:grid-cols-[1fr_1.6fr] md:px-8 md:pb-32">
      <div>
        <p className="eyebrow">FAQ</p>
        <h2 className="mt-5 text-4xl md:text-6xl">Questions</h2>
      </div>
      <div className="border-t border-line">
        {QA.map(([q, a]) => (
          <details key={q} className="group border-b border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base [&::-webkit-details-marker]:hidden">
              {q}
              <Plus size={20} className="shrink-0 transition-transform duration-300 group-open:rotate-45" />
            </summary>
            <p className="max-w-[60ch] pb-5 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
