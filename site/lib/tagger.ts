// Tags every video with TypeSafe (System One, model jev-latest): what the video does for the viewer (one fixed list for
// every creator, so accounts stay comparable), whether the caption gives a reason to keep watching, and whether it is
// part of a series. Code owns everything else: the maths, the findings and the wording.
// Server only: reads TYPESAFE_API_KEY, which must never reach the browser.

export const CONTENT_TYPES = {
  how_to: { label: "How-to", noun: "how-to videos", def: "Teaches the viewer to do something step by step: a tutorial, tip, hack, recipe or guide." },
  problem_fix: {
    label: "Problem → fix",
    noun: "problem-and-fix videos",
    def: "Shows a problem or situation in the viewer's life and what solves it, e.g. protecting a phone if it drops, shooting steadier footage.",
  },
  list: { label: "Lists", noun: "list videos", def: "A numbered list of reasons, features or tips, e.g. '3 sebab...', '5 things...'." },
  verdict: {
    label: "Verdicts",
    noun: "verdict videos",
    def: "A judgment or bold claim about value, quality or whether to buy, often a warning, e.g. 'don't be fooled by the price', 'is this embarrassing flagships?'.",
  },
  first_look: {
    label: "First looks",
    noun: "first-look videos",
    def: "Mostly labels the thing and the moment: unboxing, first impression, price reveal, launch, 'X is here'.",
  },
  story: { label: "Stories", noun: "story videos", def: "A personal story or experience with a setup and payoff, or an episode of a story series." },
  vlog: { label: "Vlogs", noun: "vlogs", def: "Follows the creator through a day, trip, outing or event visit; behind the scenes." },
  trend: { label: "Trends", noun: "trend videos", def: "Joins a trend, meme, challenge, skit or joke; made mainly to entertain." },
  promo: { label: "Promos", noun: "promo videos", def: "Mainly announces a deal, sale, discount, giveaway or sponsored offer; the offer is the point." },
  other: { label: "Other", noun: "other videos", def: "None of the above, or the caption says too little to tell." },
  no_caption: { label: "No caption", noun: "videos without a caption", def: "" }, // set by code, never asked
} as const;

export type ContentType = keyof typeof CONTENT_TYPES;
export type Tag = { type: ContentType; confidence: number; reason: number; series: number };

const URL = "https://api.typesafe.ai/v1/systemone";
// One request holds up to 20 captions (3 questions each), which stays inside the request token limit; the free trial's
// 18 videos fit in one. Longer lists (full reports) are split and the chunks run in parallel.
const CHUNK = 20;

const CONTEXT =
  "Captions come from one Malaysian creator's TikTok or Instagram videos. They may be in Malay, English or a mix; hashtags and emojis were removed. " +
  "Common words: korang = you all, berbaloi = worth it, beli = buy, sebab = reason, jangan = don't, murah = cheap, mahal = expensive.";

const ASKED = Object.fromEntries(
  Object.entries(CONTENT_TYPES)
    .filter(([k]) => k !== "no_caption")
    .map(([k, v]) => [k, v.def]),
);

function questions(path: string) {
  return {
    type: {
      type: "choice",
      instructions: { context: CONTEXT, question: `What does the video with the caption in \`${path}\` mainly do for the viewer?` },
      criteria: ASKED,
    },
    reason: {
      type: "noul",
      instructions: {
        context: CONTEXT,
        question: `Besides naming the topic or product, does the caption in \`${path}\` give the viewer a concrete reason to keep watching, such as a benefit, a problem it solves, a question or a bold claim?`,
      },
      criteria: {
        true: "It promises a benefit, raises a problem or question, or makes a claim the video will pay off.",
        false: "It only names the topic, product or moment, e.g. 'Unboxing X' or 'X price reveal'.",
      },
    },
    series: {
      type: "noul",
      instructions: {
        context: CONTEXT,
        question: `Does the caption in \`${path}\` mark the video as one part of a series, e.g. 'Part 2', 'Ep 3', 'sambungan', 'day 5 of'?`,
      },
      criteria: { true: "It says or clearly implies the video is one installment of a series.", false: "It stands alone." },
    },
  };
}

type Answer = { choice?: string; confidence?: number; noul?: number };

async function ask(state: unknown, qs: Record<string, unknown>, key: string): Promise<Record<string, Answer>> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions: qs }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return (await res.json()).answers;
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(`TypeSafe HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Strips hashtags and emoji so the judgment reads the words the viewer reads first.
export function cleanCaption(text: string) {
  return text
    .replace(/#\S+/g, "")
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\(no caption\)$/i, "");
}

export async function tagCaptions(captions: string[]): Promise<Tag[]> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY is not set");

  const clean = captions.map(cleanCaption);
  const asked = clean.map((c, i) => ({ c, i })).filter((x) => x.c.length >= 3);
  const chunks: { c: string; i: number }[][] = [];
  for (let s = 0; s < asked.length; s += CHUNK) chunks.push(asked.slice(s, s + CHUNK));

  const tags: Tag[] = clean.map(() => ({ type: "no_caption", confidence: 1, reason: 0, series: 0 }));
  await Promise.all(
    chunks.map(async (chunk) => {
      const qs: Record<string, unknown> = {};
      chunk.forEach((_, j) => {
        for (const [k, q] of Object.entries(questions(`videos[${j}].caption`))) qs[`${k}_${j}`] = q;
      });
      const a = await ask({ videos: chunk.map((x) => ({ caption: x.c })) }, qs, key);
      chunk.forEach((x, j) => {
        const type = a[`type_${j}`]?.choice as ContentType | undefined;
        tags[x.i] = {
          type: type && type in CONTENT_TYPES ? type : "other",
          confidence: a[`type_${j}`]?.confidence ?? 0,
          reason: a[`reason_${j}`]?.noul ?? 0,
          series: a[`series_${j}`]?.noul ?? 0,
        };
      });
    }),
  );
  return tags;
}
