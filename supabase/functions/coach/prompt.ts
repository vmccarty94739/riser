import { z } from 'npm:zod@4.6.5';

import type { Kind } from './stats.ts';

/** Stable across every request, so it can be cached as the prompt prefix. */
export const SYSTEM = `You are the coach inside Riser, a habit-tracking app. People track good habits they're building and bad habits they're quitting, and check in each day.

You'll get a digest of one person's real data. Write to them directly ("you"), like a sharp, warm personal coach who has actually looked at their numbers.

How to coach:
- Ground everything in the digest. Quote the real numbers: percentages, streak lengths, counts, weekday names. Never invent habits, numbers or events, and don't claim a trend the data doesn't show.
- Name the specific habit, using the name the person gave it.
- Celebrate real wins specifically. Name slips honestly, without guilt or lecturing.
- For bad habits, a check-in means a clean day, so talk about staying clean or avoiding it, not "doing" it.
- Tips must be concrete and doable today, tied to that habit and to when it tends to slip (a quick hack, not general advice).
- If a goal keeps coming up short (often partly done or missed), suggest making it smaller. If it's always met easily, suggest stretching it.
- With little history (a few days, or a brand-new habit), say it's early and give a good starting tip instead of reading trends into it.
- Plain text only: no markdown, no bullet characters, at most one emoji per field. Keep within the lengths asked for.
- For substance habits (smoking, vaping, alcohol, drugs), be supportive and practical; don't give medical advice.`;

export const DailySchema = z.object({
  title: z.string().describe('A short headline, at most 50 characters.'),
  message: z
    .string()
    .describe('The nudge: 1-3 sentences, at most 240 characters, grounded in the numbers.'),
  tip: z.string().describe('One practical thing to do today, at most 140 characters.'),
});

export const ReflectionSchema = z.object({
  title: z.string().describe('A short headline for the period, at most 60 characters.'),
  summary: z
    .string()
    .describe(
      'What happened in the period: 2-4 sentences, at most 400 characters. Lead with the most consistent habit and its percentage, then what slipped and when.'
    ),
  highlights: z
    .array(
      z.object({
        emoji: z.string().describe('The habit icon from the digest, or one fitting emoji.'),
        text: z.string().describe('One specific observation with a number, at most 110 characters.'),
      })
    )
    .describe('2 to 4 highlights, most important first.'),
  focus: z.string().describe('One focus for the next period, at most 160 characters.'),
});

export type Daily = z.infer<typeof DailySchema>;
export type Reflection = z.infer<typeof ReflectionSchema>;

export function instructions(kind: Kind) {
  if (kind === 'daily')
    return 'Write today\'s coaching nudge. Pick the one thing that matters most right now: a streak worth protecting, a habit that has been slipping, or a goal that needs adjusting. Example of the tone: "You\'ve nailed sleep for 14 days! But water intake is low. A quick hack: …"';
  const period = kind === 'weekly' ? 'week' : 'month';
  return `Write this ${period}'s reflection summary. Compare with the previous period where it helps. Example of the tone: "You were most consistent with meditation (92%) but exercise dropped off mid-week."`;
}
