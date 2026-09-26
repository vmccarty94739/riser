import type Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.128.0/helpers/zod';

import { DailySchema, ReflectionSchema } from './prompt.ts';
import { instructions, SYSTEM } from './prompt-text.ts';
import type { Kind } from './stats.ts';

/** Which model writes a message, and how much it thinks first. */
export type Setup = {
  model: string;
  /**
   * `off`: no thinking. `budget`: Haiku-style fixed thinking budget (tokens, >= 1024).
   * `effort`: adaptive thinking at an effort level (Sonnet 5 and newer).
   */
  thinking:
    | { type: 'off' }
    | { type: 'budget'; tokens: number }
    | { type: 'effort'; level: 'low' | 'medium' | 'high' };
};

/** Production setups. The daily one is chosen by `eval.ts` (cheapest that passes). */
export const DAILY: Setup = { model: 'claude-haiku-4-5', thinking: { type: 'off' } };
export const REFLECTION: Setup = {
  model: 'claude-sonnet-5',
  thinking: { type: 'effort', level: 'medium' },
};

export type Written = {
  title: string;
  body: string;
  tip: string;
  highlights: { emoji: string; text: string }[];
};

const clip = (text: string, max: number) =>
  text.length <= max ? text.trim() : `${text.slice(0, max - 1).trimEnd()}…`;

function thinkingParams(setup: Setup) {
  const t = setup.thinking;
  if (t.type === 'budget')
    return { thinking: { type: 'enabled' as const, budget_tokens: t.tokens } };
  if (t.type === 'effort')
    return { thinking: { type: 'adaptive' as const }, effort: t.level };
  return {};
}

/** Asks Claude for one message. Returns null on a refusal or unparseable output. */
export async function generate(
  client: Anthropic,
  kind: Kind,
  digest: string,
  setup: Setup
): Promise<{ written: Written; usage: Anthropic.Usage } | null> {
  const { thinking, effort } = thinkingParams(setup);
  const base = {
    model: setup.model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: 'user' as const,
        content: `${instructions(kind)}\n\n<digest>\n${digest}\n</digest>`,
      },
    ],
    ...(thinking ? { thinking } : {}),
  };

  if (kind === 'daily') {
    const response = await client.messages.parse({
      ...base,
      output_config: { ...(effort ? { effort } : {}), format: zodOutputFormat(DailySchema) },
    });
    const out = response.stop_reason === 'refusal' ? null : response.parsed_output;
    if (!out) return null;
    return {
      usage: response.usage,
      written: {
        title: clip(out.title, 60),
        body: clip(out.message, 300),
        tip: clip(out.tip, 180),
        highlights: [],
      },
    };
  }

  const response = await client.messages.parse({
    ...base,
    output_config: { ...(effort ? { effort } : {}), format: zodOutputFormat(ReflectionSchema) },
  });
  const out = response.stop_reason === 'refusal' ? null : response.parsed_output;
  if (!out) return null;
  return {
    usage: response.usage,
    written: {
      title: clip(out.title, 70),
      body: clip(out.summary, 480),
      tip: clip(out.focus, 200),
      highlights: out.highlights
        .slice(0, 4)
        .map((h) => ({ emoji: clip(h.emoji, 8), text: clip(h.text, 140) })),
    },
  };
}
