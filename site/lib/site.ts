// Public facts about the site, shared by the metadata, JSON-LD, llms.txt-style Markdown and the trust pages.
// Dependency-free on purpose so proxy.ts and the tests can import it.

export const SITE = "https://ruangkotak.com";
export const SITE_NAME = "RUANGKOTAK";
export const SITE_TITLE = "RUANGKOTAK | Account diagnosis for TikTok and Instagram creators in Malaysia";
export const SITE_DESCRIPTION =
  "RUANGKOTAK reads your latest 15 TikTok or Instagram videos and shows which content types work, which sink, and the one thing to fix first. Free mini-diagnosis, no password.";

export type PageSpec = { path: string; title: string; markdown: string };

// Word for word what the home page shows (components/landing/markup.ts); tests/jsonld.test.ts fails if they drift apart.
export const FAQ: [string, string][] = [
  ["Do you need my password?", "No. We only read public videos: views, captions and dates. Nothing needs your password, and we never post anything."],
  ["Will you translate my captions?", "Never. Your captions, titles and series names stay exactly as you wrote them, in Malay or any other language. The report around them is in English."],
  ["Is it really free?", "Yes. The mini diagnosis is free. We ask for your name and email so we can send you a copy. Monthly is quoted after a short application, based on your account and goals."],
  ["Who checks the report?", "Software does the reading. A person reviews every full report before it reaches you."],
  ["Which niches do you cover?", "Any niche. The method compares your videos against your own usual, so it works for food, tech, beauty, comedy or anything else."],
];

export const STEPS: [string, string][] = [
  ["Pull", "We pull your recent public videos with their views, captions and dates. Nothing needs your password."],
  ["Sort", "Each caption is read for what the video does for the viewer, and whether it gives a reason to keep watching. So you see which kinds your audience actually watches."],
  ["Compare", "Your top and bottom videos side by side, in your own words, so the pattern is plain to see."],
  ["Fix", "One clear change to start with, and a 30-day target you can check yourself."],
];

const EMAIL = "hello@ruangkotak.com";
const REG = "003713495-X";

export const ABOUT_SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "What RUANGKOTAK is",
    p: [
      `RUANGKOTAK (SSM ${REG}) is a Malaysian account diagnosis service for TikTok and Instagram creators. You give us your handle; we read your recent public videos and tell you which kinds of video your audience actually watches, which ones sink, and the one change to start with.`,
    ],
  },
  {
    h: "How a diagnosis works",
    p: [
      "We pull your latest 15 public videos with their views, captions and dates. Nothing needs your password, and we never post anything on your account.",
      "Each caption is read for what the video does for the viewer, then every video is measured against your own usual views, not against other people's. That is why it works for any niche, from food and tech to beauty and comedy.",
      "You get your top and bottom videos side by side, in your own words and language, plus one clear fix with a 30-day target you can check yourself.",
    ],
  },
  {
    h: "Who checks the work",
    p: [
      "The numbers are calculated from your data. The findings in the free mini-diagnosis are written with AI. Monthly reports are checked by a person before they reach you.",
    ],
  },
  {
    h: "Free and monthly",
    p: [
      "The mini-diagnosis is free: we ask for your name and email so we can send you a copy. Monthly starts with the full report, then re-checks your account every month and adjusts the plan with you. It is quoted after a short application, based on your account and goals.",
    ],
  },
];

export const CONTACT_SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "Email us",
    p: [
      `The fastest way to reach RUANGKOTAK is by email at ${EMAIL}. Tell us which account you are asking about (your TikTok or Instagram handle) and what you need, and we will reply to the address you write from.`,
    ],
  },
  {
    h: "Questions about a diagnosis or the monthly service",
    p: [
      "If you have a question about your mini-diagnosis, about what the report means, or about the monthly service, send us the email address you used when you asked for it so we can find your report. To apply for monthly, use the application form on the home page and we will reply with a quote.",
    ],
  },
  {
    h: "Privacy and your personal data",
    p: [
      `To ask for a copy of your personal data, to correct it, or to have it deleted, email ${EMAIL}. How we collect, use and keep personal data is explained in the Privacy Notice at ${SITE}/privacy.`,
    ],
  },
  {
    h: "Who you are dealing with",
    p: [`RUANGKOTAK, SSM registration ${REG}, Cheras, Kuala Lumpur, Malaysia. Website: ${SITE}.`],
  },
];

const mdSections = (s: { h: string; p: string[] }[]) => s.map((x) => `## ${x.h}\n\n${x.p.join("\n\n")}`).join("\n\n");

// What an agent gets for `Accept: text/markdown`. The home page text mirrors the landing page copy.
const HOME_MD = `# RUANGKOTAK: Account diagnosis for TikTok and Instagram creators in Malaysia

Every video is a box. We read what's inside. Enter your TikTok or Instagram handle and RUANGKOTAK reads your latest 15 public videos, then shows what is working, what sinks, and the one thing to fix first. The mini-diagnosis is free. No password is needed.

## How the diagnosis works

${STEPS.map(([h, t], i) => `${i + 1}. **${h}.** ${t}`).join("\n")}

## Free and monthly

### Mini diagnosis (free)

Your latest 15 videos: every content type ranked, what worked, what sank, and the one fix to start with. Shown on screen right away, with a copy in your email. Needs your name and email.

### Monthly (quoted after a short application)

Starts with the full report, then we re-check your account every month and adjust the plan with you. Includes a hook teardown of your best and weakest videos, your best days and times to post, three similar accounts compared, and restructured content pillars with named series.

## Questions

${FAQ.map(([q, x]) => `**${q}** ${x}`).join("\n\n")}

## Start

Get a free diagnosis at ${SITE}/#start.

## More

- [About](${SITE}/about)
- [Contact](${SITE}/contact): ${EMAIL}
- [Privacy Notice](${SITE}/privacy)
- [llms.txt](${SITE}/llms.txt)
- [Sitemap](${SITE}/sitemap.xml)
`;

const ABOUT_MD = `# About RUANGKOTAK\n\n${mdSections(ABOUT_SECTIONS)}\n\n[Home](${SITE}/) · [Contact](${SITE}/contact) · [Privacy](${SITE}/privacy)\n`;
const CONTACT_MD = `# Contact RUANGKOTAK\n\n${mdSections(CONTACT_SECTIONS)}\n\n[Home](${SITE}/) · [About](${SITE}/about) · [Privacy](${SITE}/privacy)\n`;
const PRIVACY_MD = `# Privacy Notice | RUANGKOTAK

RUANGKOTAK (SSM ${REG}) runs ${SITE}, an account diagnosis service for TikTok and Instagram creators in Malaysia. This is the data user responsible for your personal data under the Personal Data Protection Act 2010 (PDPA).

The full Privacy Notice, in English and Bahasa Melayu, is a web page: ${SITE}/privacy. It covers what we collect, why, who we share it with, how long we keep it, and how to ask for access, correction or deletion.

Privacy questions: ${EMAIL}

[Home](${SITE}/) · [About](${SITE}/about) · [Contact](${SITE}/contact)
`;

export const PAGES: PageSpec[] = [
  { path: "/", title: "RUANGKOTAK", markdown: HOME_MD },
  { path: "/about", title: "About", markdown: ABOUT_MD },
  { path: "/contact", title: "Contact", markdown: CONTACT_MD },
  { path: "/privacy", title: "Privacy Notice", markdown: PRIVACY_MD },
];

export function notFoundMarkdown(path: string): string {
  const shown = path.replace(/[`\r\n]/g, "").slice(0, 120);
  return `# 404: Page not found

There is no page at \`${shown}\` on ruangkotak.com. It may have moved, or it never existed. Report links only open for the person they were sent to.

Where to go next:

- [Home](${SITE}/): what RUANGKOTAK does
- [llms.txt](${SITE}/llms.txt): the guide for agents, with when to use us
- [Sitemap](${SITE}/sitemap.xml): every public page
- [Contact](${SITE}/contact): ${EMAIL}
`;
}

export function markdownResponseFor(pathname: string): { status: number; body: string } {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const page = PAGES.find((p) => p.path === clean);
  return page ? { status: 200, body: page.markdown } : { status: 404, body: notFoundMarkdown(clean) };
}

// RFC 9110 content negotiation, reduced to the one question we need: does this client want Markdown over HTML?
// A wildcard never counts as a request for Markdown, so browsers (text/html,*/*;q=0.8) keep getting HTML.
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  let md = -1;
  let html = -1;
  accept.split(",").forEach((part, i) => {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((s) => s.trim()).find((s) => s.startsWith("q="));
    const v = q ? Number.parseFloat(q.slice(2)) : 1;
    const weight = Number.isFinite(v) ? v : 0;
    // Earlier entries win ties: subtract a tiny order penalty.
    const score = weight > 0 ? weight - i * 1e-6 : 0;
    if (type === "text/markdown" && score > md) md = score;
    if (type === "text/html" && score > html) html = score;
  });
  return md > 0 && md > html;
}

export const ORGANIZATION_ID = `${SITE}/#organization`;

export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        legalName: SITE_NAME,
        url: SITE,
        logo: `${SITE}/brand/logo-still.svg`,
        description: SITE_DESCRIPTION,
        email: EMAIL,
        identifier: { "@type": "PropertyValue", propertyID: "SSM", value: REG },
        areaServed: { "@type": "Country", name: "Malaysia" },
        // Area-level only; add streetAddress and postalCode here if you want them published.
        address: { "@type": "PostalAddress", addressLocality: "Cheras", addressRegion: "Kuala Lumpur", addressCountry: "MY" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: EMAIL,
          areaServed: "MY",
          availableLanguage: ["English", "Malay"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: SITE,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "HowTo",
        "@id": `${SITE}/#how`,
        name: "How a RUANGKOTAK account diagnosis works",
        description: "Four steps from a public TikTok or Instagram handle to one clear fix. No password needed.",
        step: STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${SITE}/#method` })),
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}/#faq`,
        url: SITE,
        mainEntity: FAQ.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
      },
      {
        "@type": "Service",
        "@id": `${SITE}/#service`,
        name: "Account diagnosis for TikTok and Instagram creators",
        serviceType: "Social media account diagnosis",
        description: SITE_DESCRIPTION,
        url: SITE,
        provider: { "@id": ORGANIZATION_ID },
        areaServed: { "@type": "Country", name: "Malaysia" },
        offers: [
          { "@type": "Offer", name: "Mini diagnosis", price: "0", priceCurrency: "MYR", url: `${SITE}/#start` },
          { "@type": "Offer", name: "Monthly", description: "Quoted after a short application.", url: `${SITE}/#monthly` },
        ],
      },
    ],
  };
}
