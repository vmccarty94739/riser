import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { InfoButton } from '@/components/info-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, THEME_SWATCHES } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';
import { checkinXp, DAILY_XP, nextUnlock, PERFECT_DAY_XP } from '@/lib/xp';

/** An XP bar that animates when XP changes. */
export function XpBar({
  progress,
  height = 8,
  color,
}: {
  progress: number;
  height?: number;
  color?: string;
}) {
  const theme = useTheme();
  const value = useSharedValue(progress);
  useEffect(() => {
    value.value = withTiming(progress, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [progress, value]);
  const style = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, value.value)) * 100}%`,
  }));
  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: theme.backgroundSelected },
      ]}>
      <Animated.View
        style={[
          styles.fill,
          { borderRadius: height / 2, backgroundColor: color ?? theme.gold },
          style,
        ]}
      />
    </View>
  );
}

/** Level badge: a circle with the level number. */
export function LevelBadge({ level, size = 40 }: { level: number; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.gold },
      ]}>
      <ThemedText
        style={[
          styles.badgeText,
          { color: theme.onGold, fontSize: size * 0.42, lineHeight: size * 0.5 },
        ]}>
        {level}
      </ThemedText>
    </View>
  );
}

/** Full level card for Progress Report: rank, bar, where XP comes from, and the next unlock. */
export function LevelCard() {
  const theme = useTheme();
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const xp = useXp();
  const next = nextUnlock(xp.level);
  const swatch = next?.type === 'color' ? THEME_SWATCHES.find((s) => s.id === next.id) : null;

  return (
    <ThemedView type="goldSoft" style={styles.card}>
      <View style={styles.cardTop}>
        <LevelBadge level={xp.level} size={48} />
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              Level {xp.level} · {xp.rank}
            </ThemedText>
            <InfoButton
              title="XP & levels"
              color={theme.gold}
              text={`Every day is worth ${DAILY_XP} XP, shared across your habits: with ${xp.habitCount} habit${
                xp.habitCount === 1 ? '' : 's'
              }, each check-in is +${checkinXp(xp.habitCount)}. A perfect day adds +${PERFECT_DAY_XP}, and trophies pay a bonus shared the same way. So more habits never level you faster; doing all of them does. Levels unlock new colors and chimes. So far: ${xp.checkins} XP from check-ins, ${xp.perfectDays} from perfect days, ${xp.trophies} from trophies.`}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {xp.total.toLocaleString()} XP total · {xp.needed - xp.into} to level {xp.level + 1}
          </ThemedText>
        </View>
      </View>
      <XpBar progress={xp.progress} height={10} />
      {next && (
        <View style={styles.nextRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Level {next.level} unlocks
          </ThemedText>
          {swatch ? (
            <View style={[styles.dot, { backgroundColor: swatch[mode] }]} />
          ) : (
            <ThemedText type="small">🔔</ThemedText>
          )}
          <ThemedText type="smallBold" style={styles.nextName}>
            {next.name}
            {next.type === 'chime' ? ' chime' : ''}
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: 800,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 16,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  nextName: {
    fontSize: 13,
  },
});
