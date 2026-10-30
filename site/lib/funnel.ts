// Off until the scraper and alert keys exist: the preview and the monthly application say "Work in progress"
// and their API routes refuse, so no visitor gets sample data as their own and no lead is lost.
// Set NEXT_PUBLIC_FUNNEL_LIVE=1 (then rebuild) to switch them on.
export const FUNNEL_LIVE = process.env.NEXT_PUBLIC_FUNNEL_LIVE === "1";
export const funnelClosed = () => Response.json({ ok: false, closed: true }, { status: 503 });

// The preview route also stays closed in production while there is no APIFY_TOKEN: without it lib/source.ts runs in mock
// mode and hands every visitor the same sample report with their handle pasted on, which would pass as their own data.
// Read at call time so the check can be tested.
export const previewOpen = (env: Record<string, string | undefined> = process.env) =>
  FUNNEL_LIVE && !(env.VERCEL_ENV === "production" && !env.APIFY_TOKEN);
