/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    accent: '#208AEF',
    accentSoft: '#DCEBFD',
    gold: '#E8920C',
    goldSoft: '#FFF1D6',
    success: '#1FA971',
    danger: '#E5484D',
    dangerSoft: '#FDE8E8',
    successSoft: '#DDF5EA',
    onAccent: '#ffffff',
    onGold: '#ffffff',
    onSuccess: '#ffffff',
    onDanger: '#ffffff',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#3D9BF5',
    accentSoft: '#12304F',
    gold: '#FFB23F',
    goldSoft: '#3A2A0E',
    success: '#3DD68C',
    danger: '#FF6369',
    dangerSoft: '#3B1618',
    successSoft: '#0F3325',
    onAccent: '#ffffff',
    onGold: '#ffffff',
    onSuccess: '#ffffff',
    onDanger: '#ffffff',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Timber's brand blue: app icon, splash screen and launch overlay. */
export const BrandColor = '#1A78E6';

/**
 * Chart palettes (validated for color-vision deficiency; keep the order).
 * `series`: categorical, assigned to habit icons in first-appearance order.
 * The calendar heatmap is not here: it ramps from white to the user's main color (`useHeatRamp`).
 */
export const ChartColors = {
  light: {
    series: [
      '#2a78d6',
      '#eb6834',
      '#1baf7a',
      '#eda100',
      '#e87ba4',
      '#008300',
      '#4a3aa7',
      '#e34948',
    ],
  },
  dark: {
    series: [
      '#3987e5',
      '#d95926',
      '#199e70',
      '#c98500',
      '#d55181',
      '#008300',
      '#9085e9',
      '#e66767',
    ],
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Colors the user can swap in for the two main UI colors: `accent` (default blue) and
 * `gold` (default orange, used for streaks, challenges and trophies). The first two are always
 * available; the rest unlock at the account level in `unlockedBy`, rarest last (see `lib/xp.ts`). Chart colors and the red/green
 * good/bad colors never change.
 */
export const THEME_SWATCHES = [
  { id: 'blue', name: 'Sky Blue', light: '#208AEF', dark: '#3D9BF5', unlockedBy: 0 },
  { id: 'orange', name: 'Amber', light: '#E8920C', dark: '#FFB23F', unlockedBy: 0 },
  { id: 'teal', name: 'Lagoon Teal', light: '#0E9C9C', dark: '#2EC4C4', unlockedBy: 3 },
  { id: 'indigo', name: 'Indigo', light: '#5B5BD6', dark: '#8B8BF5', unlockedBy: 7 },
  { id: 'magenta', name: 'Magenta', light: '#C2298A', dark: '#EC5DB5', unlockedBy: 12 },
  { id: 'violet', name: 'Violet', light: '#8E4EC6', dark: '#B783E8', unlockedBy: 16 },
  { id: 'sunset', name: 'Sunset', light: '#E2572B', dark: '#FF7D52', unlockedBy: 20 },
  { id: 'midnight', name: 'Midnight', light: '#2B3A67', dark: '#8FA3E0', unlockedBy: 28 },
  { id: 'royal', name: 'Royal Purple', light: '#5A2D91', dark: '#A77BE0', unlockedBy: 34 },
  { id: 'rosegold', name: 'Rose Gold', light: '#B76E79', dark: '#E0A3AC', unlockedBy: 42 },
  { id: 'gold', name: 'Legendary Gold', light: '#B8860B', dark: '#E6BE4F', unlockedBy: 52 },
] as const;

export type SwatchId = (typeof THEME_SWATCHES)[number]['id'];

/** Mixes a hex color toward white (light mode) or black (dark mode) for soft backgrounds. */
export function softTint(hex: string, scheme: 'light' | 'dark') {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const [t, amount] = scheme === 'light' ? [255, 0.84] : [0, 0.72];
  const mix = (c: number) => Math.round(c + (t - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Text color that stays readable on `background`: white where it has enough contrast,
 * otherwise near-black. Needed because users can pick bright unlockable colors.
 */
export function readableText(background: string) {
  const contrastWithWhite = 1.05 / (luminance(background) + 0.05);
  return contrastWithWhite >= 2.6 ? '#FFFFFF' : '#111418';
}
