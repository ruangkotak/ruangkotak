# Instant audit — v1 (local)

One screen, two screenshots, three taps. The whole report lands before any
email box appears.

## Run

    npm install
    npm start          # http://localhost:8123

Runs in **demo mode** with no credentials — the full flow is operable, and the
report is clearly banner-marked as sample data.

For a real reading:

    export ANTHROPIC_API_KEY=sk-ant-...
    npm start

## What it does differently

| ISDA | here |
|---|---|
| up to 8 screenshots | 2 |
| 5 metrics retyped by hand | 0 |
| `TOO BIG` on a 4MB image | canvas-downscaled to 1600px/q0.8 before upload |
| `THAT DID NOT WORK · bad body` | one server retry, then a demo reading — never a raw error |
| a metric rendered as `—` | tile is dropped, provenance line says how many were unreadable |
| diagnosis changed between screens | computed once in `lib/score.mjs`, never by the model |
| diagnostic labels printed as content pillars | pillars come only from the grid; the diagnosis cannot reach that field |

## Pre-launch gate

Every page and API route are behind HTTP Basic Auth once `GATE_USER` and `GATE_PASS`
are both set — unset (the local default), the gate is off and nothing changes. Both
pages also carry `<meta name="robots" content="noindex, nofollow">` and
`public/robots.txt` disallows everything, so search engines stay out regardless of
whether the gate is on. Set both env vars on the host before the domain goes live to
anyone but you; drop them (or the meta tags / robots.txt) once it's ready to announce.

## Layout

    server.mjs        static + /api/audit + /api/ev
    lib/analyze.mjs   the Claude vision pass (structured output)
    lib/score.mjs     four axes -> six diagnoses, deterministic
    lib/demo.mjs      canned extraction for no-key mode
    public/index.html the whole front end

## Cost per audit

Set by `AUDIT_MODEL` (default `claude-opus-5`) and `AUDIT_EFFORT` (default
`medium`). Roughly 5k input tokens (two images + rubric) and ~3k output
(report + thinking):

| model | per audit | per 1,000 |
|---|---|---|
| claude-opus-5 | ~$0.10 | ~$100 |
| claude-sonnet-5 | ~$0.04 | ~$40 |
| claude-haiku-4-5 | ~$0.02 | ~$20 |
