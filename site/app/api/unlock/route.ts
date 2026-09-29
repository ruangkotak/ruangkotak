import { FUNNEL_LIVE, funnelClosed } from "@/lib/funnel";
import { notifyOwner } from "@/lib/notify";
import { store } from "@/lib/store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9\s-]{9,15}$/;

export async function POST(req: Request) {
  if (!FUNNEL_LIVE) return funnelClosed();
  const body = await req.json().catch(() => null);
  const reportId = String(body?.reportId ?? "");
  const contact = String(body?.contact ?? "").trim();
  if (!EMAIL.test(contact) && !PHONE.test(contact)) return Response.json({ ok: false, invalid: true }, { status: 400 });

  const report = await store.getReport(reportId);
  if (!report) return Response.json({ ok: false }, { status: 404 });

  await store.addLead(reportId, contact);
  await notifyOwner("New lead: mini-diagnosis unlocked", [
    `Account: ${report.handle} (${report.platform})`,
    `Contact: ${contact}`,
    `Report: /r/${reportId}`,
  ]);
  return Response.json({ ok: true, url: `/r/${reportId}` });
}
