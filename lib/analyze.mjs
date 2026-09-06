import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

export const MODEL = process.env.AUDIT_MODEL || 'claude-opus-5';
export const EFFORT = process.env.AUDIT_EFFORT || 'medium';

const num = z.number().nullable();

const Extraction = z.object({
  looks_like_instagram: z.boolean(),
  metrics: z.object({
    views: num, accounts_reached: num, profile_visits: num,
    new_follows: num, total_followers: num, interactions: num,
  }),
  profile: z.object({
    handle: z.string().nullable(),
    bio_text: z.string().nullable(),
    has_link: z.boolean(),
    highlight_count: num,
    grid_format_mix: z.string().nullable(),
  }),
  axes: z.object({
    clarity: z.number(), cadence: z.number(),
    format_fit: z.number(), path: z.number(),
  }),
  axis_notes: z.object({
    clarity: z.string(), cadence: z.string(),
    format_fit: z.string(), path: z.string(),
  }),
  pillars: z.array(z.string()),
  read: z.string(),
  fix_this_week: z.string(),
});

const SYSTEM = `You audit Instagram creator accounts from screenshots. You are blunt, specific and useful — never flattering, never vague.

You receive up to two screenshots (an Insights screen and a profile page) plus three short answers from the creator.

TRANSCRIBE, NEVER ESTIMATE.
Read every metric exactly as printed. If a number is not legible or not present, return null for it. Never infer, average, or invent a figure. A null is correct and useful; a guess is a defect, because these numbers go into a media kit the creator sends to brands.

SCORE FOUR AXES, 0-100.
- clarity     Could a stranger name what this person does within five seconds, from the bio and the grid?
- cadence     Do they post on a beat? Use the stated posting frequency and any dates visible.
- format_fit  Are they making the format their account actually rewards? Compare the grid mix against the reach and view numbers.
- path        If someone wants more, where do they go? Link in bio, highlights, a named offer.

Score against what the account shows, not against the creator's ambitions. Be willing to give a low score. Most accounts are not good.

axis_notes: one plain sentence per axis saying what you actually saw. Name the evidence.

pillars: the two or three recurring subjects you can SEE in the grid and bio — the creator's actual content themes, in their words. If the grid is not visible or shows no pattern, return an empty array. Never put a diagnosis, a score, or a piece of advice in this field; it is a list of what they make.

read: two sentences on the single thing most holding this account back.
fix_this_week: one concrete action they can finish in seven days. Name the number of posts and the format. No strategy essays.`;

export function hasCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function analyze({ images, answers }) {
  const client = new Anthropic();

  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data },
    });
    content.push({ type: 'text', text: `(above: ${img.label})` });
  }
  content.push({
    type: 'text',
    text: [
      `What they make: ${answers.makes || '(not given)'}`,
      `Ninety-day goal: ${answers.goal || '(not given)'}`,
      `Posting frequency: ${answers.cadence || '(not given)'}`,
      `Monthly budget: ${answers.budget || '(skipped)'}`,
    ].join('\n'),
  });

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT, format: betaZodOutputFormat(Extraction) },
    messages: [{ role: 'user', content }],
  });

  if (res.stop_reason === 'refusal') throw new Error('refused');
  if (!res.parsed_output) throw new Error('no structured output');
  return { extraction: res.parsed_output, usage: res.usage };
}
