import { notFound } from "next/navigation";
import fixture from "@/data/fixture.json";
import { Logo } from "@/components/logo";
import { MiniReport } from "@/components/mini-report";
import { analyze } from "@/lib/analyze";
import { MOCK } from "@/lib/source";
import { store } from "@/lib/store";
import type { AccountData } from "@/lib/types";

export const metadata = { title: "Mini-diagnosis | RUANGKOTAK", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A report only opens after someone left a contact for it, so the teaser's id alone can't skip the gate.
  const report =
    id === "sample" ? analyze("sample", fixture as AccountData, MOCK) : (await store.isUnlocked(id)) ? await store.getReport(id) : null;
  if (!report) notFound();

  return (
    <main className="mx-auto max-w-[940px] px-4 py-8 md:py-12">
      <a href="/" aria-label="RUANGKOTAK home" className="mb-8 inline-block">
        <Logo className="h-[16px] w-auto" />
      </a>
      {id === "sample" && <p className="mb-6 text-sm text-muted">Sample report from a real creator account. Username hidden.</p>}
      <MiniReport report={report} redact={id === "sample"} />
    </main>
  );
}
