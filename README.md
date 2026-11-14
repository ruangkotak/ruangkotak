# RUANGKOTAK

RUANGKOTAK is a marketing agency for creators. The website is the Next.js app
in `site/`, hosted on Vercel at **https://ruangkotak.com**. Pushing to `main`
deploys to production (Vercel Root Directory is `site`).

## Run

    cd site
    npm install
    npm run dev        # http://localhost:3100

## KNOX Mission Control (private ops board, formerly Station)

The board is shown as **KNOX Mission Control**, and every section heading on
it starts with KNOX (KNOX Stages, KNOX CMO, KNOX Infra …). Only the visible
name changed: the address is still `/station`, and the code, API routes, env
vars, job ids and the `Station/` notes folder keep their names. The rest of
this section still says "Station" when it means those.

Since 14 Nov 2026 the owner's page uses the Station Lite layout: a header of
business numbers, a command box that reads the board back (it never changes
or sends anything), the five stages as one floor strip with an avatar each,
and the tabs Needs me, Clients, Carousel, Money, Reports, Health and How it
works. Health holds what used to be the Mission, Jobs and Alerts tabs; old
`#station`, `#jobs` and `#alerts` links open it. A client's page is unchanged.
Quotations, invoices, brief upload and adding leads by command were part of
Lite and are not here: the site stores no documents.

**Ask for work** (Needs me tab): the owner types an ask and picks a desk. The
ask waits on the site (`/api/station/asks`, owner only) until the laptop's
`route-asks` job collects it, writes it as a line in `Station/Asks.md` and
confirms; the site then deletes its copy. From there it is an ordinary ask:
routed to the desk, drafted by that desk's agent, and listed under Make as an
agent draft. The site never runs an agent and never touches the notes folder.

`/station` shows every department, desk, scheduled job, approval gate and
infra probe on one screen, for @alanazizreview and for paying clients. It
is a 404 to anyone without a key.

- **Open it:** `https://ruangkotak.com/station?key=<STATION_KEY>`. The key is
  swapped for a 30-day session cookie and removed from the URL.
- **Needs me (where you land):** the five stages (Audience, Onboard, Make,
  Post, Paid) and one queue of everything waiting on you, nearest due date
  first. Both are built from the same gate readings, clients and jobs as the
  rest of the page; nothing new is stored. Each item names the file or tab to
  act in. A named final-review item has a **Done** button and the DM, brief
  and drafts checklists have **Clear all**: the press takes the item off the
  queue at once and the laptop's `needs-me-sync` job ticks the line within
  about 5 minutes. Invoices, content review, prices and links have no button
  and are cleared where they live. Post counts the posts on your content
  board that are approved but not yet marked `PUBLISHED`; set the status once
  a post is live. A job's warning about its own gate joins that gate's line
  instead of showing twice, and system items say where to fix them. Clients never see this tab.
- **Stage avatars:** each stage has a small box character (Scout, Host,
  Maker, Courier, Clerk). A yellow `!` means work is waiting on you, a red
  `×` means it is past its window, dimmed means the stage is not counted
  yet. When a stage's count drops between two reads, its avatar takes one
  short walk.
- **Update to send:** viewing one account as the owner shows its week as
  plain text with a Copy button. It uses only what the client page already
  shows, never prices. You send it yourself.
- **Carousel studio:** `/station/carousel` (owner only, linked beside the
  account pills). Paste a script, one line per slide, add product photos,
  pick one of five grid backgrounds and six colours, then download up to 8
  PNGs (1080 × 1350) as a zip and copy the caption and hashtags. Everything
  is drawn in the browser: nothing is uploaded or stored.
- **Dates:** a final-review line can carry `due 2026-11-20` (draft to the
  client) and `post 2026-11-25`. Needs me sorts by the due date and marks a
  missed one.
- **Money:** each client card has *Price per reel (RM)* and *Reels per
  month*. A client without a price shows in Needs me and the Onboard stage;
  the Paid stage shows the monthly total agreed. Only the owner sees it.
- **Add a client:** open the **Clients** tab, enter their name and
  Instagram handle, and press *Add client*. Station shows their private link
  once, with a ready-to-send WhatsApp message. Their reel velocity and
  final-review jobs start on your laptop by themselves: no deploy, no env
  vars. Each client card tracks onboarding (link opened, first velocity run,
  final-review checklist ready, price agreed) and has *New link* (the old one stops at
  once), *Pause/Resume* and *Remove*. Only a hash of each key is stored.
- **Client link (manual, older way):** `/station?key=<CLIENT_KEY_<SLUG>>&account=<slug>`
  for clients written into the registry file. None ships there now: the old
  `client-demo` account was removed.
- **Edit what exists:** `site/data/station/registry.json` (accounts,
  departments, desks, jobs, gates). Cron is Malaysia time.
- **Make the notes folder (once):** from `site/`, run
  `node --experimental-strip-types scripts/station-vault.mts ~/Documents/ruangkotak-notes`.
  It creates `Station/` with the starter files (Asks, DM message, invoices, costs, payroll) and a TASKS.md, and never
  overwrites a file that exists.
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

  | `reminder-check` | Digest Editor | 08:00, 20:00 | reads `TASKS.md` (repo root or vault, or `--tasks <file>`); writes `<vault>/Station/Digest.md`; overdue tasks and waits over 7 days go to *Needs you* |
  | `brief-sweep` | Dispatcher | 07:00 Mon–Sat | new monthly applications from the site go into `<vault>/Station/brief-queue.md`; the **Brief** gate counts unticked ones (24h window) |

  | `board-completeness` | CMO Reviewer | 09:00 | reads `content/<date>/*.md` and their `**Status:**` line; the **Review** gate counts drafts dated today or later; a draft publishing within a day that isn't approved goes to *Needs you* |
  | `<client>-final-check` (`final-check`) | CDO Reviewer | 18:00 weekdays | counts unticked lines in `<vault>/Station/final-queue-<client>.md` for the **Final** gate, which the client also sees; add `- [ ] Reel 3 v2` lines by hand |
  | `needs-me-sync` | Router | every 5m | carries out the Done presses from Needs me: ticks the matching lines in the checklist files and re-reads a final-review file at once; presses wait on Station while the laptop is off |
  | `route-asks` | Router | every 15m | routes each new line in `<vault>/Station/Asks.md` to a desk by `#tag` (`#editor`, `#cdo` …) or keyword, and appends `→ Desk`; asks with no desk go to *Needs you* |

  | `invoice-chase` | Billing Clerk | 10:00 weekdays | `<vault>/Station/invoices.md`; the **Invoice** gate counts unpaid invoices; past-due ones go to *Needs you* |
  | `cost-watch` | Cost Analyst | Monday 09:00 | `<vault>/Station/costs.md`: monthly run-rate, renewals within 7 days (→ *Needs you*), and this cycle's real Apify usage when `APIFY_TOKEN` is set (above 80% → *Needs you*) |
  | `books-summary` | Controller | Monday 09:30 | writes `<vault>/Station/Finance.md`: paid this month and last, invoiced, outstanding, costs, paid minus costs |
  | `kpi-weekly` | Payroll & KPI | Monday 10:00 | adds this week's row to `<vault>/Station/KPI.md`: the site funnel's last 7 days plus revenue paid this month |
  | `payroll-check` | Payroll & KPI | 10:30 weekdays | `<vault>/Station/payroll.md`: unpaid payouts and their total; payouts due within 3 days or late go to *Needs you*; paid payroll is netted in `Finance.md` |

  **Ledgers:** `invoices.md` lines look like
  `- [ ] INV-012 · client-demo · RM 3,500 · sent 2026-11-01 · due 2026-11-20`
  (tick and add `paid <date>` when paid); `costs.md` lines like
  `- Apify · USD 49/mo · renews 2026-11-15`; `payroll.md` lines like
  `- [ ] Aina (editor) · RM 2,500 · due 2026-11-30` (tick and add
  `paid <date>`; enter what you actually pay, EPF/SOCSO/EIS are not worked
  out). All three are created with instructions on first run. Station gets
  counts and totals, never names, invoice numbers or one person's pay.

  **Briefs:** each line has handle, platform, niche, views and goal, so you
  can judge the brief. Names and contact details never leave the server;
  reply from the owner alert you already get, then tick the box.

  **Comment → DM:** new keyword comments are appended to
  `<vault>/Station/dm-queue-alanazizreview.md`. Station's **DM** gate counts
  unticked lines and goes to *Needs you* after 4 hours. Commenters' names
  and words never leave the laptop.

  **Sending the DM automatically** uses Instagram's own API for your
  professional account (free, and the only way to DM a commenter: one
  "private reply" per comment, within 7 days of it):

  1. At developers.facebook.com create an app, add the **Instagram** product,
     choose *API setup with Instagram login*, add your account and generate
     a token with `instagram_business_basic`, `instagram_business_manage_comments`
     and `instagram_business_manage_messages`.
  2. `node --experimental-strip-types scripts/station-install.mts --ig-token <token>`:
     comments are now read through the API (no Apify cost for this job).
  3. Write the message in `<vault>/Station/dm-message.md` (created on the
     next run; `{username}` becomes their handle).
  4. Turn sending on with `--dm-send on` (`--dm-send off` stops it).

  It only messages keyword comments first seen while sending is on (never
  the backlog), never your own, never twice, at most 20 per run. Sent lines
  are ticked "DM sent"; a failed one stays unticked with Meta's reason and
  goes to *Needs you*. The token is refreshed weekly and saved back to
  `station.env`. Until Meta approves the app (App Review), it may only be
  allowed to message accounts that have a role on the app; those failures
  show up the same way.

  `station-tick.mts --list` shows what runs and when, `--run <job>` runs one
  now, and `station-install.mts --uninstall` removes the agent. To add a job:
  list it in the registry and drop `<jobId>.mts` into `scripts/station/jobs/`.
  For anything else, wrap it with `scripts/station-run.mts <jobId> -- <command>`.
  Three failures in a row (or a run open over an hour) is **stuck** and lands
  in *Needs you*. Anything without a real data source shows `NO PROBE` or
  `no read path yet`, never a made-up number.
- **Agents that draft the work:** with `--agents on`, asks the router sends
  to a desk with an agent (creative-lead for scripts, cards, captions and
  design briefs; social-lead for strategy, publishing and the funnel;
  account-director for the COO desks; media-buyer; security-reviewer) are
  handed to that agent every 15 minutes: Claude Code runs on your laptop in
  print mode with the agent's own instructions and read-only tools (Read,
  Grep, Glob; no shell, edits or web), at most 2 asks per run. The answer
  lands in `<vault>/Station/Drafts/`, linked from the ask and listed in
  `drafts-queue.md`; the **Drafts** gate counts drafts waiting for you
  (24 h). Approving (ticking) sends, posts or publishes nothing. Video,
  colour, sound and shoot desks have no agent and stay human. Uses your
  Claude plan.
- **Reels checked by the site:** every personal or client account with an
  Instagram handle (starting with @alanazizreview) has its newest 12 reels
  fetched by the website itself, using its own `APIFY_TOKEN`, when the last
  check is 6+ hours old: after you open Station and in the daily 9am check.
  Each check is a run of that account's velocity job (source "server"), so a
  failing scrape shows and alerts like any job. Your own account's page sits
  at the top of the all-accounts view. The laptop's velocity job skips its
  scrape when the site checked in the last 5 hours.
- **Client pages:** a client's link (and your view filtered to one account)
  opens on *This week* (reels posted, plays gained, delivered, in final
  review), their reels with plays per hour and a trend line, and their
  deliverables by name: in final review, then delivered once ticked. Names
  come from `final-queue-<client>.md`, so write them for the client.
- **Telegram alerts:** when something new lands in *Needs you* (a stuck
  job, a late invoice or payout, an overdue task, a gate past its window, the
  site down, a failed DM), Station sends one Telegram message through the
  same bot as the application alerts, and another when it clears. Checks run
  after every laptop beat, while you have Station open, and once a day
  (Vercel cron, `CRON_SECRET`) as a safety net. A reworded item (1 → 2 late)
  is re-sent at most every 6 hours; a slow site is not an alert (only down);
  a closed laptop only after 12 hours. *Alerts* tab → *Send test alert*.
- **Env vars:** `STATION_KEY`, one `CLIENT_KEY_<SLUG>` per client
  (`client-demo` → `CLIENT_KEY_CLIENT_DEMO`), and optionally `NOTION_TOKEN`
  for the Notion tile. Data lives in the same Upstash Redis as the funnel.
