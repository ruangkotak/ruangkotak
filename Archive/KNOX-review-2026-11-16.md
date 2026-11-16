# KNOX Mission Control review, 16 Nov 2026

Every item found in the review now has a decision. Nothing is open.
"Done" means it is fixed in pull request 64. "Kept" means it stays as it is, with the reason, and what would change that.

## A. Things that looked wrong

| Item | Decision |
| --- | --- |
| A warning about posting could land on the Review line in Needs me | **Done.** Each warning now joins the line of the gate it is about. Tested. |
| Two agent drafts made on the same day could overwrite each other | **Done.** A second draft with the same name gets " 2", " 3". |
| Approve and Reject on agent drafts stopped when there was no `content/` folder | **Done.** `draft-review` runs without the folder and skips only the content-board half. |
| An error message containing `$` could garble a checklist line | **Done.** In `ig-comment-dm` and `agent-work`. |
| `?to=` links only knew the old tabs | **Done.** `needs`, `clients`, `carousel`, `money`, `reports`, `health` and `how` work; the old names still open Health. |
| Telegram messages linked to `/station#alerts` | **Done.** They link to `#health`. Old messages still open the right tab. |
| Money tab: the tile counted active clients, the table also listed paused ones | **Done.** The tile is now labelled "Active clients". |
| Two final-review lines with the same name for one client count as one item | **Kept.** Fixing it means changing what the laptop sends for every deliverable. Give deliverables different names ("Reel 3 v2", "Reel 3 v3"). Revisit if it ever bites. |
| A client record can lose an edit when two saves meet at the same moment | **Kept.** One owner, a handful of clients: the window is a fraction of a second. Revisit if a second person starts editing clients. |

## B. Names (KNOX vs Station)

| Item | Decision |
| --- | --- |
| Notes written into your vault, job messages on Health, the installer's last line | **Done.** They say KNOX. Files already in your vault keep their old headers; new ones get the new wording. |
| The `Station/` folder, `/station` address, `STATION_*` settings, script names | **Kept**, as the README already says. Renaming them would break your laptop install and every saved link. |
| Client pages still show Mission, Jobs, Alerts | **Kept.** Clients have always had these three; changing them is a design choice for you, not a bug. |
| Section numbers on Health run 02 to 10 | **Kept.** They are department numbers from the registry. Cosmetic. |

## C. Efficiency

| Item | Decision |
| --- | --- |
| The client list was read three times for every page load and every 30-second refresh | **Done.** Read once per request. |
| The alert check builds a second full snapshot after a refresh | **Kept.** It has to run after the reel check, and it is already limited to once a minute. |
| A Done press rebuilds the whole board | **Kept.** A few presses a day. |
| A laptop beat is 6 to 8 Redis commands sent one by one | **Kept for now.** Batching them is the real saving, but it changes every write path and needs a test against real Upstash, which I could not run here. Do it if Upstash usage becomes a cost. |
| `kpi-weekly` and `ig-velocity` fetch the whole board for one field | **Kept.** Once a week and four times a day. |
| The brief sweep and report list scan every Redis key | **Kept.** Fine at today's size; revisit past a few thousand reports. |

## D. Copied code

| Item | Decision |
| --- | --- |
| `slugify`, the copy button, the RM formatter, "today in Malaysia" in the components | **Done.** One copy each. |
| The post status lists in `board-completeness` and `draft-review` | **Done.** One copy; the misnamed `WAITING` list is gone. |
| `mytDay` / `myt` in the laptop scripts, `median`, the reel and brief types | **Kept.** The scripts are deliberately self-contained; sharing these saves a few lines and couples the laptop code to the site's. |

## E. Possibly no longer needed

| Item | Decision |
| --- | --- |
| The old `dm-seen-<handle>.json` state file reader | **Done.** Removed. |
| The unused `no` option on the Needs you list | **Done.** Removed. |
| `/station/carousel` as its own page | **Kept.** It works, costs nothing, and a bookmark to it keeps working. |
| Manual client keys (`CLIENT_KEY_<SLUG>`) | **Kept.** It is the only way to give a client a link if Redis is down, and it is well tested. |
| The "no read path" desk state | **Kept.** Small, and the registry can use it the day a desk needs it. |
| Station Lite wording in the command box, How it works and the README | **Kept.** It is your own explanation of the switch made two days ago. Delete it whenever it stops being useful. |
| The Notion tile | **Kept.** It shows NO PROBE until `NOTION_TOKEN` is set; remove it only if Notion is out of the stack for good. |
| `station-run.mts`, the hand-run Redis tests, desks with no agent or job | **Kept.** Tools and a map of the business, not dead code. |
| `client-demo` in README and ledger examples | **Kept.** They are examples of a line, not a real account. |

## F. Outside KNOX

Not touched, so KNOX work stays separate. If you want them cleaned, ask for it as its own piece of work:

- `.claude/removed/` (graft archive from 31 Oct) and the graft rules in `.gitignore` and `.ignore`
- `.impeccable/critique/2026-09-12…` (reviews a page that no longer exists)
- the root `.env.example` (`PORT`, `GATE_USER`, `GATE_PASS`: no code reads them) and the "pre-launch gate" line in the security-reviewer agent
- the empty root `package.json` and `package-lock.json`
- `site/lib/track.ts` names `funnel-counts.ts`; the file is `funnel-counts.mts`
