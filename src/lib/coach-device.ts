import { ExpoLocalLlmModule, generate, type Schema } from 'expo-local-llm';
import { Platform } from 'react-native';

import { instructions, SYSTEM } from '../../supabase/functions/coach/prompt-text';
import type { Digest, Kind } from '../../supabase/functions/coach/stats';
import type { Written } from '@/lib/coach-rules';

/**
 * The coach on the phone's own AI model: Apple Foundation Models (iOS 26+ with Apple
 * Intelligence) or Gemini Nano (supported Android phones), via `expo-local-llm`. Free, private
 * (nothing leaves the device) and offline. Small models make more mistakes than Claude, so every
 * answer is checked against the facts and discarded if it fails; the caller then uses the rules.
 * Not available in Expo Go (native module) — that falls back to the rules too.
 */

export const DEVICE_MODEL_NAME = Platform.OS === 'ios' ? 'Apple Intelligence' : 'Gemini Nano';

export const DAILY_SCHEMA: Schema = {
  title: { type: 'string', description: 'A short headline, at most 50 characters.' },
  message: {
    type: 'string',
    description: 'The nudge: 1-3 sentences, at most 240 characters, grounded in the numbers.',
  },
  tip: {
    type: 'string',
    description:
      'One practical thing to do today for a named habit, specific to that habit, at most 140 characters.',
  },
};

export const REFLECTION_SCHEMA: Schema = {
  title: { type: 'string', description: 'A short headline, at most 60 characters.' },
  summary: {
    type: 'string',
    description:
      '2-4 sentences, at most 400 characters: the most consistent habit with its percentage, then what slipped.',
  },
  highlights: {
    type: 'array',
    description: '2 to 4 highlights, each one specific observation with a number.',
    items: {
      type: 'object',
      properties: {
        emoji: { type: 'string', description: 'The habit icon from the digest.' },
        text: { type: 'string', description: 'At most 110 characters.' },
      },
    },
  },
  focus: { type: 'string', description: 'One focus for the next period, at most 160 characters.' },
};

const TIMEOUT_MS = 25_000;
let downloadRequested = false;

/** Whether the phone's model can run right now (and quietly asks Android to fetch it if needed). */
export function deviceModelReady() {
  if (!ExpoLocalLlmModule) return false;
  try {
    const availability = ExpoLocalLlmModule.getAvailability();
    if (availability === 'downloadRequired' && !downloadRequested) {
      downloadRequested = true;
      ExpoLocalLlmModule.downloadModel().catch(() => {});
    }
    return availability === 'available';
  } catch {
    return false;
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Every number in the answer must appear in the digest: small models sometimes invent stats. */
function numbersAreReal(answer: string, digest: string) {
  const known = new Set(digest.match(/\d+/g) ?? []);
  return (answer.match(/\d+/g) ?? []).every((n) => known.has(n));
}

function namesAHabit(tip: string, digest: Digest) {
  const lower = tip.toLowerCase();
  return digest.habits.some(
    (h) =>
      lower.includes(h.name.toLowerCase()) ||
      h.name
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.length >= 4 && lower.includes(w))
  );
}

/** A message from the phone's model, or null (unavailable, timed out, or failed the checks). */
export async function writeOnDevice(kind: Kind, digest: Digest): Promise<Written | null> {
  if (!deviceModelReady()) return null;
  try {
    const raw = await Promise.race([
      generate(`${instructions(kind)}\n\n<digest>\n${digest.text}\n</digest>`, {
        instructions: SYSTEM,
        responseFormat: 'json',
        schema: kind === 'daily' ? DAILY_SCHEMA : REFLECTION_SCHEMA,
        options: { temperature: 0.4 },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!raw) return null;
    const out = JSON.parse(raw) as Record<string, unknown>;

    const written: Written =
      kind === 'daily'
        ? { title: text(out.title), body: text(out.message), tip: text(out.tip), highlights: [] }
        : {
            title: text(out.title),
            body: text(out.summary),
            tip: text(out.focus),
            highlights: (Array.isArray(out.highlights) ? out.highlights : [])
              .map((h: { emoji?: unknown; text?: unknown }) => ({
                emoji: text(h?.emoji).slice(0, 8),
                text: text(h?.text),
              }))
              .filter((h) => h.text)
              .slice(0, 4),
          };

    const all = [
      written.title,
      written.body,
      written.tip,
      ...written.highlights.map((h) => h.text),
    ].join(' ');
    if (!written.title || !written.body || !written.tip) return null;
    if (written.title.length > 70 || written.body.length > 480 || written.tip.length > 200)
      return null;
    if (!numbersAreReal(all, digest.text)) return null;
    if (kind === 'daily' && !namesAHabit(written.tip, digest)) return null;
    return written;
  } catch {
    return null;
  }
}
