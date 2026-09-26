import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Confetti } from '@/components/confetti';
import { HabitIcon } from '@/components/habit-icon';
import { ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { activeOn, countOn, currentStreak, useHabits, type Habit } from '@/hooks/use-habits';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { captureProof, proofUri } from '@/lib/proofs';
import { checkinXp } from '@/lib/xp';

const BUTTON = 50;

/** Full-width habit row for the Dashboard. Tap the ring to check in; long-press it to undo. */
export function HabitRow({ habit, day }: { habit: Habit; day: string }) {
  const theme = useTheme();
  const { habits, setProof, removeHabit } = useHabits();
  const { checkIn, undo, feedback } = useRewards();
  const count = countOn(habit, day);
  const done = count >= habit.target;
  const quit = habit.kind === 'quit';
  const streak = currentStreak(habit);
  const proof = habit.proofs[day];
  const scale = useSharedValue(1);
  const [burst, setBurst] = useState(0);
  const [floater, setFloater] = useState<{ key: number; text: string } | null>(null);

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const press = () => {
    const result = checkIn(habit, day);
    scale.set(
      withSequence(
        withTiming(0.82, { duration: 70 }),
        withSpring(1, { damping: 5, stiffness: 320 })
      )
    );
    if (result === 'complete' || result === 'perfect') {
      setBurst((k) => k + 1);
      setFloater({ key: Date.now(), text: `+${checkinXp(activeOn(habits, day).length)} XP` });
    }
    if (result === 'tick') setFloater({ key: Date.now(), text: '+1' });
  };

  // Long-press the row (not the ring) for quick Edit / Delete.
  const openActions = () => {
    if (Platform.OS === 'web') return router.push(`/habit/${habit.id}`);
    feedback('undo');
    Alert.alert(habit.name, undefined, [
      {
        text: 'Edit habit',
        onPress: () =>
          router.push({ pathname: '/habit/[id]', params: { id: habit.id, edit: '1' } }),
      },
      {
        text: 'Delete habit',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Delete habit?',
            `"${habit.name}" and its history will be removed. Trophies stay.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => removeHabit(habit.id) },
            ]
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addProof = async () => {
    const file = await captureProof(habit.id, day);
    if (!file) return;
    setProof(habit.id, day, file);
    feedback('tick');
  };

  // Quit habits: red until the day is logged clean, then unmistakably green.
  const ringColor = done ? theme.success : quit ? theme.danger : theme.accent;
  const background = quit ? (done ? theme.successSoft : theme.dangerSoft) : theme.backgroundElement;
  const border = done ? theme.success : quit ? theme.danger : 'transparent';

  const status =
    habit.target > 1 ? `${count} of ${habit.target} today` : done ? 'Done today' : 'Not done yet';

  // VoiceOver sees the row as one element (it would otherwise hide the ring and camera inside it),
  // so the ring, camera and long-press menu are offered as its swipe-up/down actions.
  // A single check-in toggles; a multi-check-in habit counts up, then only undo takes one away.
  const multi = habit.target > 1;
  const checkInLabel = quit
    ? done
      ? 'Undo clean log'
      : 'Log clean today'
    : multi
      ? done
        ? null
        : `Log one (${count} of ${habit.target})`
      : done
        ? 'Mark not done'
        : 'Mark done';
  const spokenStatus = quit ? (done ? 'Clean today' : 'Not logged yet') : status;
  const open = () => router.push(`/habit/${habit.id}`);
  const onAction = (name: string) => {
    if (name === 'checkIn') press();
    else if (name === 'undo') undo(habit, day);
    else if (name === 'proof') void addProof();
    else if (name === 'edit') openActions();
  };

  return (
    <Pressable
      onPress={open}
      onLongPress={openActions}
      delayLongPress={450}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}${habit.note ? `, ${habit.note}` : ''}. ${spokenStatus}${
        streak > 0 ? `, ${streak}-day streak` : ''
      }`}
      accessibilityHint="Opens the habit. Swipe up or down to check in."
      accessibilityActions={[
        ...(checkInLabel ? [{ name: 'checkIn', label: checkInLabel }] : []),
        ...(multi && count > 0 ? [{ name: 'undo', label: 'Undo one' }] : []),
        ...(!quit && done
          ? [{ name: 'proof', label: proof ? 'Change proof photo' : 'Add a proof photo' }]
          : []),
        { name: 'edit', label: 'Edit or delete' },
      ]}
      onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
      style={[
        styles.row,
        { backgroundColor: background, borderColor: border },
        burst > 0 && styles.raised,
      ]}>
      <HabitIcon icon={habit.emoji} size={30} quit={quit} />

      <View style={styles.body}>
        <ThemedText type="smallBold" style={styles.name}>
          {habit.name}
        </ThemedText>
        {habit.note ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            {habit.note}
          </ThemedText>
        ) : null}
        {quit ? (
          done ? (
            <Animated.View
              key="clean"
              entering={FadeIn}
              style={[styles.cleanPill, { backgroundColor: theme.success }]}>
              <ThemedText type="smallBold" style={[styles.cleanText, { color: theme.onSuccess }]}>
                ✓ CLEAN TODAY{streak > 1 ? ` · 🔥 ${streak} days` : ''}
              </ThemedText>
            </Animated.View>
          ) : (
            <ThemedText type="small" style={[styles.status, { color: theme.danger }]}>
              Stayed clean? Tap the ring to log it.
            </ThemedText>
          )
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.status}>
            {status}
            {streak > 0 ? ` · 🔥 ${streak}` : ''}
          </ThemedText>
        )}
      </View>

      {!quit &&
        done &&
        (proof ? (
          <Pressable
            accessibilityRole="button"
            onPress={addProof}
            hitSlop={8}
            accessibilityLabel="Change proof photo">
            <Image source={{ uri: proofUri(proof) }} style={styles.thumb} contentFit="cover" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={addProof}
            hitSlop={8}
            accessibilityLabel="Add a proof photo"
            style={[styles.proofChip, { backgroundColor: theme.background }]}>
            <ThemedText style={styles.proofIcon}>📷</ThemedText>
          </Pressable>
        ))}

      <View style={styles.buttonWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            quit
              ? `Log ${habit.name} as clean${done ? ' (undo)' : ''}`
              : habit.target > 1
                ? `Log one ${habit.name}. ${count} of ${habit.target} done.`
                : `Mark ${habit.name} ${done ? 'not done' : 'done'}`
          }
          onPress={press}
          onLongPress={() => undo(habit, day)}
          delayLongPress={350}
          hitSlop={10}>
          <Animated.View style={buttonStyle}>
            <ProgressRing
              size={BUTTON}
              stroke={4}
              progress={quit && !done ? 1 : count / habit.target}
              color={ringColor}
              trackColor={theme.backgroundSelected}>
              {done ? (
                <Animated.View
                  key="done"
                  entering={ZoomIn.springify().damping(9)}
                  style={[styles.doneFill, { backgroundColor: theme.success }]}>
                  <ThemedText style={[styles.checkMark, { color: theme.onSuccess }]}>✓</ThemedText>
                </Animated.View>
              ) : habit.target > 1 ? (
                <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 13 }}>
                  {count}/{habit.target}
                </ThemedText>
              ) : (
                <ThemedText style={[styles.plus, { color: ringColor }]}>
                  {quit ? '✓' : '+'}
                </ThemedText>
              )}
            </ProgressRing>
          </Animated.View>
        </Pressable>
        {floater && (
          <FloatingPlus
            key={floater.key}
            text={floater.text}
            color={floater.text === '+1' ? theme.accent : theme.gold}
          />
        )}
        {burst > 0 && (
          <View pointerEvents="none" style={styles.burstOrigin}>
            <Confetti
              key={burst}
              x={0}
              y={0}
              count={20}
              power={400}
              gravity={900}
              duration={1000}
              spread={1}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** A "+1" or "+5 XP" that floats up and fades from the check-in button. */
function FloatingPlus({ text, color }: { text: string; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateY: -32 * t.value }, { scale: 0.8 + t.value * 0.4 }],
  }));
  return (
    <Animated.Text
      maxFontSizeMultiplier={1.2}
      pointerEvents="none"
      numberOfLines={1}
      style={[styles.floating, { color }, style]}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1.5,
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.three,
  },
  raised: {
    zIndex: 10,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
  },
  note: {
    fontSize: 13,
    lineHeight: 17,
  },
  status: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  cleanPill: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    marginTop: Spacing.one,
  },
  cleanText: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  buttonWrap: {
    width: BUTTON,
    height: BUTTON,
  },
  doneFill: {
    width: BUTTON - 10,
    height: BUTTON - 10,
    borderRadius: (BUTTON - 10) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 800,
  },
  plus: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 600,
  },
  burstOrigin: {
    position: 'absolute',
    left: BUTTON / 2,
    top: BUTTON / 2,
    width: 0,
    height: 0,
    overflow: 'visible',
  },
  floating: {
    position: 'absolute',
    top: -6,
    width: 80,
    left: BUTTON / 2 - 40,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 800,
  },
  proofChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  thumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
});
