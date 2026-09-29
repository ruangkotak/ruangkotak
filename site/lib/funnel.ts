// Off until the scraper and alert keys exist: the preview and the monthly application say "Work in progress"
// and their API routes refuse, so no visitor gets sample data as their own and no lead is lost.
// Set NEXT_PUBLIC_FUNNEL_LIVE=1 (then rebuild) to switch them on.
export const FUNNEL_LIVE = process.env.NEXT_PUBLIC_FUNNEL_LIVE === "1";
export const funnelClosed = () => Response.json({ ok: false, closed: true }, { status: 503 });
