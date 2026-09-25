import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/confetti';
import { LevelBadge, XpBar } from '@/components/level-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { readableText, Spacing, THEME_SWATCHES } from '@/constants/theme';
import { tierFor, trophyOf, useHabits, type Challenge } from '@/hooks/use-habits';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';
import { iconText } from '@/lib/icons';
import { nextUnlock, PERFECT_DAY_XP, rankFor, tierXp, type Unlock } from '@/lib/xp';

type Swatch = (typeof THEME_SWATCHES)[number];

export type TrophyMoment = {
  challenge: Challenge;
  /** The length of the ladder challenge that was auto-started, or null for custom challenges. */
  nextLength: number | null;
  /** XP this trophy was worth. */
  xp: number;
  preview?: boolean;
};

export type LevelUpMoment = { from: number; to: number; unlocks: Unlock[]; preview?: boolean };

type Props = {
  confettiKey: number;
  perfectKey: number;
  trophy: TrophyMoment | null;
  onCloseTrophy: () => void;
  levelUp: LevelUpMoment | null;
  onCloseLevelUp: () => void;
  onLevelUpShown: () => void;
  playChime: (id: string) => void;
};

/** App-wide reward overlays: confetti, the "perfect day" toast, trophies and level-ups. */
export function CelebrationLayer({
  confettiKey,
  perfectKey,
  trophy,
  onCloseTrophy,
  levelUp,
  onCloseLevelUp,
  onLevelUpShown,
  playChime,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [confettiDone, setConfettiDone] = useState(0);

  return (
    <>
      {confettiKey > confettiDone && (
        <Confetti
          key={confettiKey}
          x={width / 2}
          y={height * 0.45}
          count={90}
          power={1300}
          spread={0.3}
          onDone={() => setConfettiDone(confettiKey)}
        />
      )}
      {perfectKey > 0 && <PerfectToast key={perfectKey} />}
      <ChallengeWon moment={trophy} onClose={onCloseTrophy} />
      {/* A level-up waits until any trophy moment is dismissed. */}
      {!trophy && levelUp && (
        <LevelUp
          moment={levelUp}
          onClose={onCloseLevelUp}
          onShown={onLevelUpShown}
          playChime={playChime}
        />
      )}
    </>
  );
}

function PerfectToast() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + Spacing.two }]}>
      <Animated.View
        entering={FadeInUp.springify().damping(14)}
        exiting={FadeOutUp}
        style={[styles.toast, { backgroundColor: theme.gold }]}>
        <ThemedText style={styles.toastEmoji}>✨</ThemedText>
        <View>
          <ThemedText type="smallBold" themeColor="onGold">
            Perfect day
          </ThemedText>
          <ThemedText type="small" themeColor="onGold">
            Every habit done, every bad habit avoided. +{PERFECT_DAY_XP} XP
          </ThemedText>
        </View>
      </Animated.View>
    </View>
  );
}

function ChallengeWon({ moment, onClose }: { moment: TrophyMoment | null; onClose: () => void }) {
  const theme = useTheme();
  const xpNow = useXp();
  const { width, height } = useWindowDimensions();
  const spin = useSharedValue(0);
  const bounce = useSharedValue(1);

  useEffect(() => {
    if (!moment) return;
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: 9000, easing: Easing.linear }), -1);
    bounce.value = withRepeat(
      withSequence(withSpring(1.12, { damping: 6 }), withSpring(1, { damping: 8 })),
      -1,
      true
    );
  }, [moment, spin, bounce]);

  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const trophyStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));

  if (!moment) return null;
  const { challenge, nextLength } = moment;
  const xpInfo = xpNow;
  const trophy = trophyOf(challenge);
  const next = nextLength ? tierFor(nextLength) : null;

  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      transparent
      animationType="fade"
      visible
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Confetti x={width / 2} y={height * 0.4} count={120} power={1500} spread={0.45} />
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.cardWrap}>
          <ThemedView type="background" style={styles.cardShell}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.card}>
              <View style={styles.trophyWrap}>
                <Animated.View style={[styles.rays, raysStyle]}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.ray,
                        {
                          backgroundColor: theme.gold,
                          opacity: 0.18,
                          transform: [{ rotate: `${i * 30}deg` }],
                        },
                      ]}
                    />
                  ))}
                </Animated.View>
                <Animated.Text maxFontSizeMultiplier={1.2} style={[styles.trophy, trophyStyle]}>
                  {trophy.icon}
                </Animated.Text>
              </View>

              <ThemedText type="smallBold" style={{ color: theme.gold, letterSpacing: 1.5 }}>
                TROPHY UNLOCKED{moment.preview ? ' · PREVIEW' : ''}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.center}>
                {trophy.name}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                {challenge.length} days of {iconText(challenge.habitEmoji)} {challenge.habitName}{' '}
                without a miss. It’s in your trophy cabinet now.
              </ThemedText>

              <View style={[styles.xpPill, { backgroundColor: theme.gold }]}>
                <ThemedText type="smallBold" style={{ color: theme.onGold }}>
                  +{moment.xp.toLocaleString()} XP
                </ThemedText>
              </View>
              <TrophyLevel />

              {next && (
                <ThemedView type="backgroundElement" style={styles.nextUp}>
                  <ThemedText style={styles.nextIcon}>{next.icon}</ThemedText>
                  <View style={styles.flex}>
                    <ThemedText type="small" themeColor="textSecondary">
                      NEXT UP · STARTS TOMORROW
                    </ThemedText>
                    <ThemedText type="smallBold">
                      {next.name} · {nextLength} days · +{tierXp(next.days, xpInfo.habitCount)} XP
                    </ThemedText>
                  </View>
                </ThemedView>
              )}

              <Pressable
                onPress={onClose}
                style={[styles.primary, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor="onAccent">
                  {next ? 'Keep climbing →' : 'Awesome'}
                </ThemedText>
              </Pressable>
            </ScrollView>
          </ThemedView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The account level bar inside the trophy moment. */
function TrophyLevel() {
  const xp = useXp();
  return (
    <View style={styles.trophyLevel}>
      <LevelBadge level={xp.level} size={28} />
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">
          Level {xp.level} · {xp.into}/{xp.needed} XP
        </ThemedText>
        <XpBar progress={xp.progress} height={6} />
      </View>
    </View>
  );
}

/** "Level up!" with whatever the new level unlocked, applied in one tap. */
function LevelUp({
  moment,
  onClose,
  onShown,
  playChime,
}: {
  moment: LevelUpMoment;
  onClose: () => void;
  onShown: () => void;
  playChime: (id: string) => void;
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const next = nextUnlock(moment.to);
  const nextSwatch = next?.type === 'color' ? THEME_SWATCHES.find((s) => s.id === next.id) : null;

  useEffect(() => {
    onShown();
    // Only when this level-up first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      transparent
      animationType="fade"
      visible
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Confetti x={width / 2} y={height * 0.35} count={90} power={1300} spread={0.4} />
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.cardWrap}>
          <ThemedView type="background" style={styles.cardShell}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.card}>
              <LevelBadge level={moment.to} size={96} />
              <ThemedText type="smallBold" style={{ color: theme.gold, letterSpacing: 1.5 }}>
                LEVEL UP{moment.preview ? ' · PREVIEW' : ''}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.center}>
                Level {moment.to} · {rankFor(moment.to)}
              </ThemedText>
              {moment.unlocks.length ? (
                moment.unlocks.map((u) =>
                  u.type === 'color' ? (
                    <ColorUnlock
                      key={u.id}
                      swatch={THEME_SWATCHES.find((s) => s.id === u.id)!}
                      onApplied={moment.preview ? undefined : onClose}
                    />
                  ) : (
                    <ChimeUnlock
                      key={u.id}
                      id={u.id}
                      name={u.name}
                      playChime={playChime}
                      onApplied={moment.preview ? undefined : onClose}
                    />
                  )
                )
              ) : (
                <ThemedText themeColor="textSecondary" style={styles.center}>
                  Every check-in, perfect day and trophy keeps you climbing.
                </ThemedText>
              )}
              {next && (
                <View style={styles.nextLevel}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Level {next.level} unlocks
                  </ThemedText>
                  {nextSwatch ? (
                    <View style={[styles.swatchDot, { backgroundColor: nextSwatch[mode] }]} />
                  ) : (
                    <ThemedText type="small">🔔</ThemedText>
                  )}
                  <ThemedText type="small" style={styles.swatchName}>
                    {next.name}
                    {next.type === 'chime' ? ' chime' : ''}
                  </ThemedText>
                </View>
              )}
              <Pressable
                onPress={onClose}
                style={[styles.primary, { backgroundColor: theme.accent }]}>
                <ThemedText type="smallBold" themeColor="onAccent">
                  Keep going →
                </ThemedText>
              </Pressable>
            </ScrollView>
          </ThemedView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** A newly unlocked chime: preview it or switch to it. */
function ChimeUnlock({
  id,
  name,
  playChime,
  onApplied,
}: {
  id: string;
  name: string;
  playChime: (id: string) => void;
  onApplied?: () => void;
}) {
  const theme = useTheme();
  const { settings, updateSettings } = useHabits();
  const active = settings.chime === id;
  return (
    <ThemedView type="backgroundElement" style={styles.unlock}>
      <View style={styles.unlockHeader}>
        <ThemedText style={styles.chimeIcon}>🔔</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            NEW CHIME UNLOCKED
          </ThemedText>
          <ThemedText type="smallBold">{name}</ThemedText>
        </View>
      </View>
      <View style={styles.unlockButtons}>
        <Pressable
          onPress={() => playChime(id)}
          style={[styles.unlockButton, { borderColor: theme.accent }]}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            ▶ Preview
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => {
            updateSettings({ chime: id });
            playChime(id);
            onApplied?.();
          }}
          style={[
            styles.unlockButton,
            { borderColor: theme.accent },
            active && { backgroundColor: theme.accent },
          ]}>
          <ThemedText type="small" style={{ color: active ? theme.onAccent : theme.accent }}>
            {active ? 'In use' : 'Use this chime'}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

/** "● Lagoon Teal" note for a color reward. */
export function SwatchNote({ swatch, prefix }: { swatch: Swatch; prefix: string }) {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <View style={styles.swatchNote}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.swatchText}>
        {prefix}
      </ThemedText>
      <View style={[styles.swatchDot, { backgroundColor: swatch[mode] }]} />
      <ThemedText type="small" style={[styles.swatchText, styles.swatchName]}>
        {swatch.name}
      </ThemedText>
    </View>
  );
}

/** Lets the user apply a newly unlocked color to either main color right away. */
function ColorUnlock({ swatch, onApplied }: { swatch: Swatch; onApplied?: () => void }) {
  const { updateSettings, settings } = useHabits();
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const color = swatch[mode];
  const apply = (patch: { accent?: string; gold?: string }) => {
    updateSettings(patch);
    onApplied?.();
  };
  return (
    <ThemedView type="backgroundElement" style={styles.unlock}>
      <View style={styles.unlockHeader}>
        <View style={[styles.unlockDot, { backgroundColor: color }]} />
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            NEW COLOR UNLOCKED
          </ThemedText>
          <ThemedText type="smallBold">{swatch.name}</ThemedText>
        </View>
      </View>
      <View style={styles.unlockButtons}>
        <Pressable
          onPress={() => apply({ accent: swatch.id })}
          style={[
            styles.unlockButton,
            { borderColor: color },
            settings.accent === swatch.id && { backgroundColor: color },
          ]}>
          <ThemedText
            type="small"
            style={{ color: settings.accent === swatch.id ? readableText(color) : color }}>
            Use as main
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => apply({ gold: swatch.id })}
          style={[
            styles.unlockButton,
            { borderColor: color },
            settings.gold === swatch.id && { backgroundColor: color },
          ]}>
          <ThemedText
            type="small"
            style={{ color: settings.gold === swatch.id ? readableText(color) : color }}>
            Use as highlight
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastEmoji: {
    fontSize: 26,
    lineHeight: 32,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    alignSelf: 'center',
  },
  cardShell: {
    borderRadius: Spacing.five,
    overflow: 'hidden',
  },
  card: {
    borderRadius: Spacing.five,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  trophyWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rays: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 14,
    height: 150,
    borderRadius: 7,
  },
  trophy: {
    fontSize: 84,
    lineHeight: 100,
  },
  center: {
    textAlign: 'center',
  },
  swatchNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: 2,
  },
  swatchText: {
    fontSize: 12,
    lineHeight: 16,
  },
  swatchName: {
    fontWeight: 700,
  },
  swatchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unlock: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  unlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  unlockDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  unlockButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  unlockButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
  },
  flexCenter: {
    alignItems: 'center',
  },
  xpPill: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  trophyLevel: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    marginVertical: Spacing.one,
  },
  nextLevel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginVertical: Spacing.one,
  },
  chimeIcon: {
    fontSize: 24,
    lineHeight: 30,
  },
  pips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.one,
    marginVertical: Spacing.two,
  },
  pip: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  primary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  nextUp: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  nextIcon: {
    fontSize: 30,
    lineHeight: 36,
  },
  flex: {
    flex: 1,
  },
});
