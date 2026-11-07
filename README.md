# RUANGKOTAK

RUANGKOTAK is a marketing agency for creators. The website is the Next.js app
in `site/`, hosted on Vercel at **https://ruangkotak.com**. Pushing to `main`
deploys to production (Vercel Root Directory is `site`).

## Run

    cd site
    npm install
    npm run dev        # http://localhost:3100

## Station (private ops board)

`/station` shows every department, desk, scheduled job, approval gate and
infra probe on one screen, for @alanazizreview and for paying clients. It
is a 404 to anyone without a key.

- **Open it:** `https://ruangkotak.com/station?key=<STATION_KEY>`. The key is
  swapped for a 30-day session cookie and removed from the URL.
- **Client link:** `/station?key=<CLIENT_KEY_<SLUG>>&account=<slug>` opens a
  read-only view of that one account: its CMO/CDO jobs, gates and log, with no
  internal departments, infra or other accounts.
- **Edit what exists:** `site/data/station/registry.json` (accounts,
  departments, desks, jobs, gates). Cron is Malaysia time.
- **Report from a job:** wrap the command, and it sends start/ok/fail beats:

      STATION_KEY=… node site/scripts/station-run.mts ig-velocity-6h -- ./my-job.sh
      STATION_KEY=… node site/scripts/station-run.mts --gate report --waiting 3

  Three failures in a row (or a run open over an hour) is **stuck** and lands
  in *Needs you*. Anything without a real data source shows `NO PROBE` or
  `no read path yet`, never a made-up number.
- **Env vars:** `STATION_KEY`, one `CLIENT_KEY_<SLUG>` per client
  (`client-demo` → `CLIENT_KEY_CLIENT_DEMO`), and optionally `NOTION_TOKEN`
  for the Notion tile. Data lives in the same Upstash Redis as the funnel.
