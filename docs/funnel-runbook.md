# Funnel runbook

Read this before touching the funnel. One entry per real break. Newest last.

## 2026-11-04: no alert and no mini-diagnosis after a submission

- **Symptom:** the form said "Work in progress: the free diagnosis opens soon." and no report email or owner alert arrived.
- **Root cause (two faults):**
  1. Production was built without `NEXT_PUBLIC_FUNNEL_LIVE=1`, so `/api/preview` returned `503 {"closed":true}` before any scrape, email or alert. The variable is inlined at build time, so editing it (last edited 1 Nov) did nothing until the next rebuild (4 Nov 01:24 MYT). The old value was never read, so exactly what changed is unconfirmed.
  2. `ALERT_EMAIL` pointed at `alerts@ruangkotak.com`, the sender address, which has no inbox. It hard-bounced on 3 Nov, Resend suppressed it, and every alert after that was dropped. Resend returns 200 for suppressed sends, so `lib/notify.ts` logged nothing.
- **Fix:** Vercel production env only, no code change. `ALERT_EMAIL` set to alanazizreview@gmail.com, `NEXT_PUBLIC_FUNNEL_LIVE` set to `1`, one production redeploy (dpl_A1nrQ8ajGDRzeDwTHJcoLY3dBBqD).
- **Early-warning check:**
  - `curl -s -X POST https://ruangkotak.com/api/preview -H 'content-type: application/json' -d '{"handle":"!","platform":"instagram"}'` must return 400, not 503 `closed`. It costs nothing.
  - In Resend, the latest "[RUANGKOTAK]" alert must have status `delivered`, not `suppressed` or `bounced`.
- **Prevention:** after any change to `NEXT_PUBLIC_*`, redeploy and run the curl probe above. Never point `ALERT_EMAIL` at an address with no inbox. Suggested, not done: make `notify.ts` log when Resend reports a suppressed address.
- **Verified after the fix (4 Nov, 02:14 MYT):** a test submission for @alanazizreview with a +test address returned ok. Resend showed the report email and the owner alert both `delivered`. It reused the report saved on 3 Nov, so no scrape ran.
- **Telegram:** Alan confirmed the Telegram alert arrived for the same test.
- **Not verified:** a fresh scrape from a new handle. The report email is capped at 2 per address per rolling 24h, which is why the test used a +test address.
