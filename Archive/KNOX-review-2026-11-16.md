# KNOX Mission Control review, 16 Nov 2026

For Alan to review. Nothing in this file has been changed in the code: these are the items I was not sure enough
about to fix on my own. Each one says what I saw, where, and what I would do. Tick or delete as you decide.

What I did fix is in the pull request, not here.

## A. Looks wrong, needs your decision

- [ ] **A warning can land on the wrong line in Needs me.** The content board job sends one warning that can be
  about drafts ("publishing within a day, not approved") or about posting ("approved post past its posting date").
  Needs me attaches it to the first line it finds for that job, which is the Review line whenever one exists, even
  when the warning is about posting. `site/lib/station.ts` (buildPipeline, the "twin" lookup).
  Suggest: have the job send the two warnings separately, one per gate.
- [ ] **Two agent drafts made on the same day can overwrite each other.** The draft file is named from the date and
  the first 40 characters of the ask, so two asks that start the same way write the same file.
  `site/scripts/station/jobs/agent-work.mts` (the `name` line). Suggest: add the ask id to the file name.
- [ ] **Approve and Reject on agent drafts stop when there is no `content/` folder.** `draft-review` refuses to run
  without the content folder, although agent drafts do not live there. `site/scripts/station/jobs/draft-review.mts`
  (`unavailable`). Suggest: only skip the content-board half.
- [ ] **Two final-review lines with the same name for one client count as one item.** Done ticks only the first, and
  the page gets two cards with the same id. `site/lib/station.ts` (key `final:<account>:<label>`).
  Suggest: use the line's hidden id in the key instead of its name.
- [ ] **A client record can lose an edit when two writes meet.** Every write saves the whole record. If a client
  opens their link (which stamps "last opened") at the moment you save a price, or the laptop's invoice sync lands
  while you add a talent job, the later save wins and the other change is lost. Rare, but silent.
  `site/app/api/station/enter/route.ts`, `site/app/api/station/clients/route.ts`.
- [ ] **Money tab counts and table disagree.** The "Clients" tile counts active clients only; the table under it
  also lists paused ones. `site/components/station/lite.tsx` (MoneyTab). Decide which you want.
- [ ] **Links with `?to=` only know the old tabs.** `?to=jobs`, `alerts` and `agents` all open Health now; `clients`
  works; `needs`, `money`, `reports` and `health` are not accepted. `site/app/api/station/enter/route.ts`.
- [ ] **Telegram messages link to `/station#alerts`.** It still works (old links open Health), but `#health` would be
  the honest address. Two tests pin the old one. `site/lib/station-live.ts`, `site/app/api/station/alerts/route.ts`.
- [ ] **An error message with a `$` in it can garble a checklist line.** A failed DM or agent run writes Meta's or
  Claude's reason into the line with a text replace that treats `$1`, `$&` as special.
  `ig-comment-dm.mts`, `agent-work.mts`. Small; suggest a replace function instead of a replace string.

## B. Names that do not match (KNOX vs Station)

The README says only the visible name changed. These are visible, and still say Station:

- [ ] Notes written into your vault files: "done in Station 10:02" (`needs-me-sync.mts`), the headers of
  `invoices.md`, `payroll.md`, `brief-queue.md`, `dm-queue-*.md`, `final-queue-*.md`, the vault `README.md` and
  `Digest.md` ("# Station digest"). `draft-review` already writes "approved in KNOX".
- [ ] Job messages shown on the Health tab: "reels checked by Station", "Station refused the talent job update",
  "ticked from Station".
- [ ] The installer's own output ("Station's Laptop tile should read OK").
- [ ] Client pages still have the old three tabs (Mission, Jobs, Alerts) while yours has the new seven. The README
  says this is on purpose; listed only so you can confirm.
- [ ] Section numbers on Health run 02 to 10. There is no 01.

## C. Inefficient

- [ ] **Every 30-second refresh of your page costs about 25 to 30 Redis commands.** The page's own snapshot is built,
  then the alert check builds a second full one, and the client list is read three or four times along the way
  (`scopeOf`, `viewFor`, `getSnapshot`, `refreshReels` each fetch it). With the board open all day that is tens of
  thousands of commands. `site/app/api/station/state/route.ts`, `site/lib/station-live.ts`.
  Suggest: read the client list once per request and let the alert check reuse the snapshot already built.
- [ ] **A Done press rebuilds the whole board** (probes and the site funnel included) just to confirm one item is
  still on the queue. `site/app/api/station/done/route.ts`.
- [ ] **One laptop beat is 6 to 8 Redis commands**, sent one by one (push, trim, expire; set, expire). A job run sends
  two to four beats. `site/lib/store.ts`. Suggest: Upstash's pipeline endpoint, one round trip per beat.
- [ ] **`kpi-weekly` and `ig-velocity` fetch the entire board to read one field**, and that fetch also sets off a reel
  check and an alert check on the site. A small read-only endpoint would do.
- [ ] **The brief sweep and the report list scan every key in Redis** each time. Fine today, slower as reports pile up.
  `site/lib/store.ts` (`applicationsSince`, `allReports`).
- [ ] The alert check reads the "last seen" table twice in a row. `site/lib/station-live.ts` (`checkAlerts`).

## D. Copied code that could be shared

Commit 51e484e already shared some. These are left:

- [ ] "Today in Malaysia": `mytDate` (`lib/station.ts`), `mytDay` (`reminder-check.mts`), `todayMyt` (`clients.tsx`),
  and two different `myt` helpers (`queue.mts`, `agent-work.mts`).
- [ ] `slugify` is in `lib/station.ts` and again in `components/station/clients.tsx`.
- [ ] `CopyButton` and the `rm` money formatter are in both `clients.tsx` and `lite.tsx`.
- [ ] `median` is in `lib/station.ts` and `ig-velocity.mts`.
- [ ] The `Reel`, `ReelSnapshot` and `GateItem` types are declared in `scripts/station/apify.mts` and `client.mts` as
  well as `lib/station.ts`; `Brief` in `brief-sweep.mts` repeats `BriefSummary` in `lib/store.ts`.
- [ ] The "published" and "closed" status lists are in both `board-completeness.mts` and `draft-review.mts`
  (where the second list is named `WAITING` but holds the statuses that are *not* waiting).

## E. Possibly no longer needed

- [ ] **`/station/carousel` as its own page.** The Carousel tab shows the same thing and nothing links to the page.
- [ ] **Manual client keys (`CLIENT_KEY_<SLUG>` env vars).** No client uses them since `client-demo` was removed, but
  the code still accepts them as a way in. Removing the path shrinks what has to be kept safe. The tests lean on it.
- [ ] **The "no read path" desk state.** No desk in the registry is marked `noReadPath`, so the state, its icon and
  its counts never show.
- [ ] **Station Lite leftovers in the wording:** the command box's answers for `quote`, `brief` and `lead`, the
  "What is different from Station Lite" block on How it works, and the README paragraph dated 14 Nov. Useful
  during the switch; dead weight once you no longer think in Lite's terms.
- [ ] **The Notion tile.** It reads NO PROBE unless `NOTION_TOKEN` is set. Drop it if Notion is not part of the stack.
- [ ] `ig-comment-dm.mts` still reads the old `dm-seen-<handle>.json` state file from before sending existed.
- [ ] `NeedsYouList` takes a `no` option nobody passes (`components/station/parts.tsx`).
- [ ] `scripts/station-run.mts` (wrap any command as a job): no registry job uses it. Keep if you plan to.
- [ ] `tests/redis-paths.mjs` and `tests/fake-upstash.mjs` are run by hand only and are not part of `npm test`.
- [ ] Many desks have neither an agent nor a job (Scrape Agent, Shoot Producer, Colorist, Inbox, the Reviewers...).
  They only ever read "idle". Keep them if the map of the business is the point.
- [ ] The README still uses `client-demo` in its invoice example and its env var example.

## F. Outside KNOX (not touched, noted in passing)

- [ ] `.claude/removed/` holds the graft helper and settings archived on 31 Oct; `.gitignore` and `.ignore` still
  carry graft rules.
- [ ] `.impeccable/critique/2026-09-12…__public-index-html.md` reviews a page that no longer exists.
- [ ] The root `.env.example` lists `PORT`, `GATE_USER` and `GATE_PASS`. No code reads them. The security-reviewer
  agent's notes also still mention "the pre-launch gate".
- [ ] The root `package.json` and `package-lock.json` are empty shells; everything is in `site/`.
- [ ] `site/lib/track.ts` points at `scripts/funnel-counts.ts`; the file is `funnel-counts.mts`.
