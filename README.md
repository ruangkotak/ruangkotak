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
- **Wire your laptop (once):** from `site/`, run

      node --experimental-strip-types scripts/station-install.mts --key <STATION_KEY> --vault ~/path/to/notes

  It saves the key to `~/.config/ruangkotak/station.env` (mode 600) and
  installs a launchd agent (macOS) or a crontab line (Linux). That agent
  runs `scripts/station-tick.mts` every minute. Every job with a script in
  `site/scripts/station/jobs/` then runs on its registry schedule and
  reports to Station:

  | Job | Desk | Schedule | Checks |
  | --- | --- | --- | --- |
  | `station-map-obs` | Site Reliability | every 5m | ruangkotak.com answers 200 within 5s; also keeps the Laptop tile green |
  | `sync-watchdog` | Platform Engineer | every 15m | `git fetch` works; reports ahead/behind and changed files |
  | `backup-freshness-guard` | Backup & Recovery | every 6h | fails if unpushed commits or uncommitted edits are older than 24h |
  | `credential-registry` | Security Officer | 03:00 daily | fails if a tracked file holds an env file, a known token shape, or one of your local secret values |
  | `vault-conflict-scan` | Librarian | every 30m | fails if sync left conflict copies in your notes vault (only with `--vault`) |
  | `ig-velocity-6h` | Performance Analyst | every 6h | plays per hour on the newest reels vs the last scrape; fails if no reels come back (needs `--apify-token`) |
  | `ig-comment-dm` | Funnel Operator | every 15m | comments with a trigger word on reels from the last 7 days go into a DM checklist (needs `--apify-token` and `--ig-keywords "AUDIT,KOTAK"`) |

  **Comment → DM:** new keyword comments are appended to
  `<vault>/Station/dm-queue-alanazizreview.md`, or to
  `~/.local/state/ruangkotak-station/` without a vault. Tick a box once
  you've sent the DM. Station's **DM** gate counts the unticked boxes and
  goes to *Needs you* when the oldest has waited over 4 hours. Commenters'
  names and words never leave the laptop; Station gets only the count. The
  job does not send DMs itself: that needs a Meta app with messaging
  permission. Every run is an Apify call billed to your Apify account, so
  check usage after the first day. For a client, add `"instagram": "<handle>"`
  to their account in the registry, and their `*-velocity` job starts running.

  `station-tick.mts --list` shows what runs and when, `--run <job>` runs one
  now, and `station-install.mts --uninstall` removes the agent. To add a job:
  list it in the registry and drop `<jobId>.mts` into `scripts/station/jobs/`.
  For anything else, wrap it with `scripts/station-run.mts <jobId> -- <command>`.
  Three failures in a row (or a run open over an hour) is **stuck** and lands
  in *Needs you*. Anything without a real data source shows `NO PROBE` or
  `no read path yet`, never a made-up number.
- **Env vars:** `STATION_KEY`, one `CLIENT_KEY_<SLUG>` per client
  (`client-demo` → `CLIENT_KEY_CLIENT_DEMO`), and optionally `NOTION_TOKEN`
  for the Notion tile. Data lives in the same Upstash Redis as the funnel.
