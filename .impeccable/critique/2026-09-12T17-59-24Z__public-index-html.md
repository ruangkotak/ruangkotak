---
target: public/index.html
total_score: 16
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 3
target_identity: "file:/Users/alanaziz/Documents/ruangkotak/public/index.html"
target_fingerprint: "sha256:ad9a23fad1da756efaea4be7b0a0231f3d3b2948a012d5528efb57686389d585"
target_path: /Users/alanaziz/Documents/ruangkotak/public/index.html
timestamp: 2026-09-12T17-59-24Z
slug: public-index-html
---
Method: dual-agent (A: design review, B: detector + static evidence). Browser automation unavailable; B substituted computed static evidence.

# CRITIQUE - public/index.html (Persuade). Neumorphic style constraint honored.

## Design Health Score: 16/32 (heuristics 7 and 10 n/a)
1 Visibility of System Status 1 - no active nav state, no opened-post trace, + glyph at 3.67:1
2 Match System/Real World 3 - meta description register
3 User Control and Freedom 2 - closing CTA scrolls backwards; no skip link
4 Consistency and Standards 2 - --in-sm means five things; focus 2px vs 1px
5 Error Prevention 2 - good gate checklist; fails the only error that matters
6 Recognition Rather Than Recall 2 - #work unheaded; comparison is recall below 900px
7 Flexibility and Efficiency n/a
8 Aesthetic and Minimalist 3 - restrained; docked for 16-accordion wall
9 Error Recovery 1 - no fallback contact anywhere on the page
10 Help and Documentation n/a

## Specificity verdict: ~6/10 authored
#work is unliftable (16 hand-written posts, real taxonomy). Everything around it is a studio-site shell. .row styled identically in #month and #included.

## Detector: 113 warnings, exit 2
75 undersized-ui-text (two sizes: 10.88px, 9.92px), 11 layout-transition (one rule, 11 instances), 9 cramped-padding, 8 low-contrast, 8 all-caps-body, 2 tight-leading. line:0 on all.
ALL 8 low-contrast findings are FALSE POSITIVES: print-mode token overrides read against the screen background. Detector produced a FALSE NEGATIVE on the one real failure (#767676 at 3.67:1).

## Working
1. details disclosure with real no-JS story + print stylesheet force-opening posts.
2. "Not included, on purpose" - disqualifying copy substituting candor for proof. Emotional peak.
3. After-column writing: script + caption + one varied action per post.

## Priority Issues
[P0] Primary conversion action does not exist. 4 CTAs point at #apply which has no form, no mailto, no handle. Footer has no contact. Line 860 claims a form exists. TODO comment ships at line 884. Closing CTA scrolls upward. Fix: sunken form panel (--in-lg container, --in-sm field wells, raised submit), interim Tally/Google Form URL, footer contact line, fix line 860, strip TODO. -> harden
[P1] Elevation does not encode interactivity. --in-sm on logo, nav hover, btn active, ghost, rail chips, row numbers, step numbers, week numbers, act box. 16 summaries have NO resting shadow, hover-only, dead on touch. Logo reads as active nav item; rail chips read as hovered links. Fix: raised = actionable (incl. summary at rest), sunken = container/engraved at lower contrast, logo never inset, enlarge + to 1.05rem at --ink-2. -> polish
[P1] #work has no visible heading (sr-only h2 only) and its comparison dies at 900px (8 Before then 8 After). Fix: real .sec-head; week-major restructure below 900px; sticky pane labels as interim; details open on W1 pair. -> adapt
[P1] WCAG AA failures on load-bearing small type. --ink-3 #767676 = 3.67:1 at 9.92/11.52/12.48px: every section eyebrow, 16 pills, + glyph, and line 876 (the price-objection sentence). .tile .lab 4.70:1 (no margin). Component boundaries 1.14-1.23:1 vs 3:1 required (1.4.11). Fix: --ink-3 to ~#8f8f8f, move .lab/pills/+/line876 to --ink-2, widen raise ramp, pay remainder at focus/hover. -> typeset
[P2] Focus inconsistent and deforming. Line 158 border-radius:4px applies to the ELEMENT, so pills snap to rectangles on keyboard focus. summary falls through to 1px grey. No skip link, no scroll-margin-top under the 60px sticky header. Fix: one :where(a,.btn,summary):focus-visible token, drop radius override, add shadow lift. -> harden

## Persona red flags
Jordan (first-timer): wordmark video is largest element, offer is 13.8px; "FOUR CLIENTS AT A TIME" reads as full/expensive; unheaded Before; clicks Apply, reads "form takes five minutes", finds none, no email in footer. Leaves believing the site is broken.
Sam (keyboard/SR): exactly two headings, both sr-only. Every visible section title is a paragraph. Zero h3 in markup though .tile h3 is styled. 16 summaries behind a 1px ring, no skip link, CTA deforms on focus.
Casey (mobile): no nav at all below 760px. Apply link ~29px, under 44px, outside thumb zone. .wordmark aspect-ratio 1920/320 vs child video 1920/430. Empty lift-3 div = ~4rem dead space above fold. 1.07MB autoplaying video on cellular.

## Minor
Meta description is the only corporate sentence and claims "measurable demand" with zero clients. "A, not B" construction x4. "Seven things, every month" includes a quarterly item. "We shorten the onboarding list" is evasive. .tiles grid built for many holds one, stagger delays orphaned. .cols breaks at 760 but .ba at 900 (backwards). row/tile hover implies clickability on non-links. No scroll-behavior smooth. prefers-reduced-motion handling is excellent.

# AUDIT: 11/20 (Acceptable - significant work needed)
Accessibility 2, Performance 2, Responsive 2, Theming 3, Implementation Integrity 2
Severity: 1 P0, 4 P1, 3 P2, ~6 P3.
Patterns: (1) every semantic heading marked up as a paragraph, 7x; (2) removal debris from the brands cut and section-head cut in 4 places; (3) sub-11px type 75x in two sizes, both --ink-3.
Positives: zero third-party origins, zero non-semantic clickables, subset self-hosted fonts with swap, native details, real print stylesheet, thorough reduced-motion, all anchors resolve.
Order: harden, typeset, adapt, polish.
