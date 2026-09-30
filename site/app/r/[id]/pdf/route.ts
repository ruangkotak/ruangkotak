import { reportPdf } from "@/lib/pdf";
import { store } from "@/lib/store";

// Same gate as the web report: only a report someone unlocked with their contact details can be downloaded.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = (await store.isUnlocked(id)) ? await store.getReport(id) : null;
  if (!report) return new Response("Not found", { status: 404 });
  const pdf = await reportPdf(report);
  const name = `ruangkotak-diagnosis-${report.handle.replace(/[^a-z0-9._-]/gi, "")}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
