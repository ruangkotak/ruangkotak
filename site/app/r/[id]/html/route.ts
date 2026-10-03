import { renderReportHtml } from "@/lib/html";
import { store } from "@/lib/store";

// Same gate as the web report and the PDF: only a report someone unlocked with their contact details can be downloaded.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = (await store.isUnlocked(id)) ? await store.getReport(id) : null;
  if (!report) return new Response("Not found", { status: 404 });
  const name = `ruangkotak-diagnosis-${report.handle.replace(/[^a-z0-9._-]/gi, "")}.html`;
  return new Response(await renderReportHtml(report), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
