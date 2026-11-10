// Makes the notes folder (the "vault") Station reads and writes, once. Run from site/:
//
//   node --experimental-strip-types scripts/station-vault.mts [folder]      default: ~/Documents/ruangkotak-notes
//
// Creates <folder>/Station/ with the starter files each job expects (the same templates the jobs would write on
// their first run, so the formats are right), plus TASKS.md and a README. Never overwrites a file that exists, so it
// is safe to run again. Then point the installer at it:  station-install.mts --vault <folder> ...
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { COSTS_TEMPLATE, INVOICES_TEMPLATE, PAYROLL_TEMPLATE } from "./station/ledger.mts";
import { MESSAGE_TEMPLATE } from "./station/jobs/ig-comment-dm.mts";
import { ASKS_HEADER } from "./station/jobs/route-asks.mts";

const arg = process.argv[2] ?? "~/Documents/ruangkotak-notes";
const root = resolve(arg.replace(/^~(?=$|\/)/, homedir()));
const station = join(root, "Station");

const TASKS = `# Tasks

## Active

- [ ] **Example: send Alan the CMF Speaker S script** - due 2026-11-11

## Waiting On

## Done
`;

const README = `# RUANGKOTAK notes

Station (ruangkotak.com/station) reads and writes the Station/ folder here. Work by editing and ticking lines.

| File | You | Used for |
|---|---|---|
| Station/Asks.md | write | anything you want done; "- [ ] write 5 hooks for reel 14 #scriptwriter" |
| Station/Drafts/ and drafts-queue.md | tick | agent drafts waiting for you |
| Station/final-queue-<client>.md | write, tick | deliverables a client sees; made when a client is added |
| Station/dm-queue-<account>.md | tick | keyword comments owed a DM |
| Station/dm-message.md | write | the DM text; {username} becomes their handle |
| Station/brief-queue.md | tick | applications from the website to reply to |
| Station/invoices.md, costs.md, payroll.md | write | money in, tools, payouts |
| Station/Digest.md, Finance.md, KPI.md | read only | rewritten on a schedule |
| TASKS.md | write | your task list, read at 08:00 and 20:00 |

Station creates the files that are not here yet the first time each job runs.
Keep client names and amounts in this folder only: Station is sent counts and dates, never these files.
`;

const files: [string, string][] = [
  [join(root, "README.md"), README],
  [join(root, "TASKS.md"), TASKS],
  [join(station, "Asks.md"), ASKS_HEADER],
  [join(station, "dm-message.md"), MESSAGE_TEMPLATE],
  [join(station, "invoices.md"), INVOICES_TEMPLATE],
  [join(station, "costs.md"), COSTS_TEMPLATE],
  [join(station, "payroll.md"), PAYROLL_TEMPLATE],
];

mkdirSync(join(station, "Drafts"), { recursive: true });
for (const [path, body] of files) {
  if (existsSync(path)) {
    console.log(`kept     ${path}`);
  } else {
    writeFileSync(path, body);
    console.log(`created  ${path}`);
  }
}
console.log(`\nVault ready: ${root}\nNext: node --experimental-strip-types scripts/station-install.mts --key <STATION_KEY> --vault ${arg} --ig-keywords "AUDIT,KOTAK,SPEAKER" --agents on`);
