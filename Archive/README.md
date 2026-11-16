# Archive

Nothing in this folder is used by the live site, the funnel or KNOX. It is kept only so it can be looked up or
brought back. If you are looking for how something works today, it is not here.

## What is in here

| Folder or file | What it is | Why it was moved |
| --- | --- | --- |
| `old-landing/components/` | 17 pieces of the earlier home page (hero, method, ladder, FAQ, nav, marquee, the diagnosis film, the full-report view and small helpers) | No page imports them. The home page is `site/components/landing/` now. |
| `old-landing/fonts/Satoshi-Regular.woff2` | A font file | Nothing loads it. The site uses Inter. |
| `old-tooling/claude-removed/` | The graft helper, its hooks and the settings it used, switched off on 31 Oct 2026 | Already retired; moved here so there is one archive, not two. |
| `old-tooling/impeccable/` | A design critique from 12 Sep 2026 | It reviews `public/index.html`, a page that no longer exists. |
| `KNOX-review-2026-11-16.md` | The KNOX review and the decision on each finding | A record, not something to act on. |

## Where the live things are

- **The funnel** (home → free preview → report → apply): `site/app/page.tsx`, `site/components/landing/`,
  `site/components/preview-flow.tsx`, `mini-report.tsx`, `apply-form.tsx`, `site/app/r/`, `site/app/api/preview`,
  `apply`, `view`, `stats`, and `site/lib/`.
- **KNOX Mission Control**: `site/app/station/`, `site/components/station/`, `site/app/api/station/`,
  `site/lib/station*.ts`, `site/scripts/station*`.
- **Instagram comment-to-DM follow gate**: `site/app/api/ig/`, `site/lib/ig-gate.ts`.

## Left in place on purpose

These are not part of the funnel, but each is live or still used, so they stay where they are:

- `site/public/space-stack/`: the SPACE STACK game, a public page at ruangkotak.com/space-stack. Archiving it would
  take a public page offline for no gain.
- `site/app/api/alana/stt-token/`: the live microphone for the ALANA page on your laptop. It is switched off on
  the public site and only answers your own computer while `npm run dev` is running. Nothing on the website calls
  it, which is why it looks unused.
- `content/2026-09-15/` (rejected) and `content/2026-11-13/` (a pipeline test): KNOX's content board reads this
  folder, and its tests of the pipeline are part of the record. Both are already left out of the counts.
- `.claude/skills/` and `skills-lock.json`: 20 video skills Claude Code loads by that exact path.
- The root `.env.example`, `package.json` and `package-lock.json`: stale or empty, but tools look for them by name.
