import { ExpoLocalLlmModule, generate, type Schema } from 'expo-local-llm';
import { Platform } from 'react-native';

import { instructions, SYSTEM } from '../../supabase/functions/coach/prompt-text';
import type { Digest, Kind } from '../../supabase/functions/coach/stats';
import type { Insight } from '@/lib/coach-insights';
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
      'A concrete plan for a named habit, at most 200 characters: what, when (tied to a time or routine), and a smaller fallback.',
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

export const REWORD_SCHEMA: Schema = {
  title: {
    type: 'string',
    description: 'A specific headline about the pattern, at most 60 characters.',
  },
  message: {
    type: 'string',
    description:
      '2-4 sentences, at most 420 characters: the pattern you found (with its numbers), how it connects to another fact from the digest, and why it matters today.',
  },
  tip: {
    type: 'string',
    description:
      'A concrete plan for that habit, at most 240 characters: what to do, when (tied to a time or an existing routine), and a smaller fallback for a hard day.',
  },
};

export const PUSH_SCHEMA: Schema = {
  message: {
    type: 'string',
    description:
      'The notification text, 2-3 sentences, at most 300 characters: what you noticed (with a number), why it matters, and one quick, easy action for today.',
  },
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

/** Asks the phone's model for JSON against `schema`, or null if it's unavailable or too slow. */
async function ask(prompt: string, schema: Schema, timeoutMs: number, temperature = 0.7) {
  if (!deviceModelReady()) return null;
  try {
    const raw = await Promise.race([
      generate(prompt, {
        instructions: SYSTEM,
        responseFormat: 'json',
        schema,
        options: { temperature },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The digest, trimmed so the prompt fits small on-device context windows. */
const context = (digest: string) => (digest.length > 5000 ? `${digest.slice(0, 5000)}\n…` : digest);

/** Habit names quoted in the insight's message: the answer must still be about them. */
function keepsSubject(answer: string, insight: Insight) {
  const said = answer.replace(/[“”"]/g, '').toLowerCase();
  return [...insight.body.matchAll(/“([^”]+)”/g)].every((m) => said.includes(m[1].toLowerCase()));
}

/**
 * One insight (see `coach-insights.ts`) turned into a thorough, personal piece of coaching by the
 * phone's model. It gets the insight as a starting point plus the full digest, so it can connect
 * more of the person's data. Every number must come from those, and it must still be about the
 * same habit(s). Null when unavailable, slow or off-script (the caller keeps the rules version).
 */
export async function rewordOnDevice(
  insight: Insight,
  name: string,
  digest: string,
  timeoutMs = 12_000
): Promise<Pick<Written, 'title' | 'body' | 'tip'> | null> {
  const draft = `Title: ${insight.title}\nMessage: ${insight.body}\nTip: ${insight.tip}`;
  const prompt = [
    `Write ${name || 'this person'}'s coaching for this visit to the app. The note below is the main pattern our analysis found; it's your starting point, not your limit. Study the digest, confirm the pattern, and deepen it: connect it to at least one more fact from the digest (a weekday pattern, a trend, a streak or record, another habit), explain why it matters today, and turn the tip into a specific plan with a fallback for a hard day. Follow THE STANDARD.`,
    'Put every habit name in double quotes, exactly as written. Use only numbers that appear in the note or the digest.',
    `<note>\n${draft}\n</note>`,
    `<digest>\n${context(digest)}\n</digest>`,
  ].join('\n\n');
  const out = await ask(prompt, REWORD_SCHEMA, timeoutMs);
  if (!out) return null;
  const title = text(out.title);
  const body = text(out.message);
  const tip = text(out.tip);
  if (!title || !body || !tip) return null;
  if (title.length > 80 || body.length > 520 || tip.length > 300) return null;
  const all = `${title} ${body} ${tip}`;
  if (!numbersAreReal(all, `${draft}\n${insight.facts}\n${digest}`)) return null;
  if (!keepsSubject(all, insight)) return null;
  return { title, body, tip };
}

/**
 * The afternoon notification for one insight, written by the phone's model: a short, complete
 * thought from a coach who studied the data ("Hey Vaden, I noticed…"). Null → the rules text.
 */
export async function rewordPushOnDevice(
  insight: Insight,
  name: string,
  digest: string,
  timeoutMs = 12_000
): Promise<string | null> {
  const prompt = [
    `Write the afternoon notification your coach sends ${name || 'this person'} while they're out living their day. The draft below is what our analysis found; make it sound deeply thought out: what you noticed in their data (with a real number), why it matters today, and one quick, easy thing they can do right now. ${name ? `Open by addressing ${name} naturally. ` : ''}Follow THE STANDARD. It must read well on a lock screen: 2-3 sentences, no lists.`,
    'Put every habit name in double quotes, exactly as written. Use only numbers that appear in the draft or the digest.',
    `<draft>\n${insight.push}\n</draft>`,
    `<digest>\n${context(digest)}\n</digest>`,
  ].join('\n\n');
  const out = await ask(prompt, PUSH_SCHEMA, timeoutMs);
  const message = out ? text(out.message) : '';
  if (!message || message.length > 360) return null;
  if (!numbersAreReal(message, `${insight.push}\n${insight.facts}\n${digest}`)) return null;
  if (!keepsSubject(message, insight)) return null;
  return message;
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
