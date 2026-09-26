import { z } from 'npm:zod@4.6.5';

export { instructions, SYSTEM } from './prompt-text.ts';

export const DailySchema = z.object({
  title: z.string().describe('A short headline, at most 50 characters.'),
  message: z
    .string()
    .describe('The nudge: 1-3 sentences, at most 240 characters, grounded in the numbers.'),
  tip: z
    .string()
    .describe(
      'One practical thing to do today for a named habit, specific to that habit and its pattern, at most 140 characters.'
    ),
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

