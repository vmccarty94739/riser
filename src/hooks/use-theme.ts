/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, readableText, softTint, THEME_SWATCHES } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeChoice } from '@/hooks/use-habits';

/** Theme colors, with the user's unlocked color choices applied to `accent` and `gold`. */
export function useTheme() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const choice = useThemeChoice();
  const base = {
    ...Colors[mode],
    onAccent: readableText(Colors[mode].accent),
    onGold: readableText(Colors[mode].gold),
    onSuccess: readableText(Colors[mode].success),
    onDanger: readableText(Colors[mode].danger),
  };
  if (!choice) return base;

  const pick = (id: string) => THEME_SWATCHES.find((s) => s.id === id)?.[mode];
  const accent = pick(choice.accent) ?? base.accent;
  const gold = pick(choice.gold) ?? base.gold;
  return {
    ...base,
    accent,
    accentSoft: choice.accent === 'blue' ? base.accentSoft : softTint(accent, mode),
    onAccent: readableText(accent),
    gold,
    onGold: readableText(gold),
    goldSoft: choice.gold === 'orange' ? base.goldSoft : softTint(gold, mode),
  };
}
