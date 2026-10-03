import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { MiniReport } from "@/components/mini-report";
import { store } from "@/lib/store";

export const metadata = { title: "Mini-diagnosis | RUANGKOTAK", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A report only opens after someone entered their account and left a contact for it; there is no public sample.
  const report = (await store.isUnlocked(id)) ? await store.getReport(id) : null;
  if (!report) notFound();

  return (
    <main className="mx-auto max-w-[940px] px-4 py-8 md:py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <a href="/" aria-label="RUANGKOTAK home">
          <Logo className="h-[16px] w-auto" />
        </a>
        <a href={`/r/${id}/html`} download className="btn-primary">
          Download HTML
        </a>
      </div>
      <p className="mb-6 text-[13px] text-muted">
        Your report downloads as an HTML file, which opens in any browser. Need a PDF? Open the file, print it, and choose Save as PDF.
      </p>
      <MiniReport report={report} />
    </main>
  );
}
