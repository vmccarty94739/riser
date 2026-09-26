/**
 * Icon catalog for habits, organized into categories. The category drives the Dashboard's
 * collapsible sections and the Progress chart colors. Quit icons carry labels so their
 * meaning is unambiguous.
 *
 * Icons are emoji strings, except custom drawn ones (see `CUSTOM_ICONS`), which render via
 * `HabitIcon` and fall back to an emoji anywhere only text is possible (e.g. notifications).
 */
import type { HabitKind } from '@/lib/habits';

/** Custom-drawn icon ids. */
export const VAPE_ICON = 'custom:vape';
export const CUSTOM_ICONS: Record<string, string> = { [VAPE_ICON]: '💨' };

/** Plain-text form of an icon, for places that can only show text. */
export function iconText(icon: string) {
  return CUSTOM_ICONS[icon] ?? icon;
}

export type IconCategory = { key: string; label: string; icon: string };

type BuildGroup = IconCategory & { icons: string[] };
type QuitIcon = { icon: string; label: string; name: string };
type QuitGroup = IconCategory & { icons: QuitIcon[] };

export const BUILD_GROUPS: BuildGroup[] = [
  {
    key: 'health',
    label: 'Health',
    icon: '🍎',
    icons: ['💧', '🥗', '🍎', '🥦', '😴', '💊', '🦷', '🧴', '☀️', '🫁', '🥛', '🍵'],
  },
  {
    key: 'fitness',
    label: 'Fitness',
    icon: '💪',
    icons: ['🏃', '🚶', '💪', '🧘', '🚴', '🏊', '🏋️', '🥾', '🧗', '⚽', '🏀', '🎾'],
  },
  {
    key: 'mind',
    label: 'Mind',
    icon: '🧠',
    icons: ['📚', '🧠', '✍️', '🙏', '📝', '🎧', '🧩', '🌱', '🕯️', '📖', '🗣️', '📵'],
  },
  {
    key: 'life',
    label: 'Life & work',
    icon: '🗂️',
    icons: ['✅', '💻', '📈', '💰', '🧹', '🍳', '🗓️', '📧', '🎯', '⏰', '🧺', '🪴'],
  },
  {
    key: 'social',
    label: 'Creative & social',
    icon: '🎨',
    icons: ['🎸', '🎨', '📷', '🎹', '❤️', '👪', '🐶', '✈️', '🎬', '🧶', '📞', '🤝', '🌍'],
  },
];

const q = (icon: string, label: string, name: string): QuitIcon => ({ icon, label, name });

export const QUIT_GROUPS: QuitGroup[] = [
  {
    key: 'substances',
    label: 'Substances',
    icon: '🚭',
    icons: [
      q('🚬', 'Smoking', 'No smoking'),
      q(VAPE_ICON, 'Nicotine', 'No nicotine'),
      q('🍺', 'Alcohol', 'No alcohol'),
      q('🌿', 'Weed', 'No weed'),
      q('💊', 'Drugs', 'Drug-free'),
      q('💉', 'Hard drugs', 'Clean from hard drugs'),
    ],
  },
  {
    key: 'digital',
    label: 'Digital',
    icon: '📱',
    icons: [
      q('🔞', 'Adult content', 'No adult content'),
      q('📱', 'Doomscrolling', 'No doomscrolling'),
      q('💬', 'Social media', 'No social media'),
      q('🎮', 'Gaming', 'No gaming binges'),
      q('📺', 'Binge-watching', 'No binge-watching'),
    ],
  },
  {
    key: 'food',
    label: 'Food & drink',
    icon: '🍩',
    icons: [
      q('🍔', 'Junk food', 'No junk food'),
      q('🍟', 'Fast food', 'No fast food'),
      q('🍬', 'Sugar', 'No added sugar'),
      q('🥤', 'Soda', 'No soda'),
      q('☕', 'Caffeine', 'No caffeine'),
      q('⚡', 'Energy drinks', 'No energy drinks'),
      q('🌙', 'Late snacking', 'No late-night snacks'),
    ],
  },
  {
    key: 'money',
    label: 'Money',
    icon: '💸',
    icons: [
      q('🎰', 'Gambling', 'No gambling'),
      q('🎲', 'Betting', 'No sports betting'),
      q('🛒', 'Impulse buys', 'No impulse buys'),
      q('📦', 'Online shopping', 'No online shopping'),
    ],
  },
  {
    key: 'behavior',
    label: 'Mindset & behavior',
    icon: '🌀',
    icons: [
      q('😤', 'Anger', 'Keep my cool'),
      q('🛋️', 'Procrastination', 'No procrastinating'),
      q('💅', 'Nail biting', 'No nail biting'),
      q('🤬', 'Swearing', 'No swearing'),
      q('🗯️', 'Gossip', 'No gossip'),
      q('🌧️', 'Negative self-talk', 'No negative self-talk'),
    ],
  },
  {
    key: 'sleep',
    label: 'Sleep',
    icon: '🌜',
    icons: [
      q('⏰', 'Snoozing', 'No snooze button'),
      q('🦉', 'Staying up late', 'In bed on time'),
      q('📲', 'Phone in bed', 'No phone in bed'),
      q('😴', 'Oversleeping', 'No oversleeping'),
    ],
  },
];

export const OTHER_CATEGORY: IconCategory = { key: 'other', label: 'Other', icon: '✨' };

export const DEFAULT_BUILD_ICON = '✅';
export const DEFAULT_QUIT_ICON = '🚬';

/** The category a habit belongs to, from its kind and icon. */
export function categoryOf(kind: HabitKind, icon: string): IconCategory {
  const groups = kind === 'quit' ? QUIT_GROUPS : BUILD_GROUPS;
  const match = groups.find((g) =>
    g.icons.some((i) => (typeof i === 'string' ? i : i.icon) === icon)
  );
  return match ? { key: match.key, label: match.label, icon: match.icon } : OTHER_CATEGORY;
}

/** Categories in their fixed display (and chart color) order. */
export function categoriesFor(kind: HabitKind): IconCategory[] {
  const groups = kind === 'quit' ? QUIT_GROUPS : BUILD_GROUPS;
  return [...groups.map(({ key, label, icon }) => ({ key, label, icon })), OTHER_CATEGORY];
}
