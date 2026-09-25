import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Segmented } from '@/components/habit-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCloud } from '@/hooks/use-cloud';
import { useCoach } from '@/hooks/use-coach';
import { fmtDay, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import type { CoachMessage } from '@/lib/coach';

/** Shown in ⓘ and the opt-in: what the coach does and what it sends. */
export const COACH_ABOUT =
  'Your coach reads your streaks and check-ins and writes you a personal nudge each day, plus a weekly and monthly report. It’s written by AI (Anthropic’s Claude). To do that, your habit names and check-in history are sent to Anthropic. Nothing else is shared, and you can turn the coach off anytime in Settings.';

/** Asks before any habit data goes to the AI coach (App Store rule for third-party AI). */
export function CoachOptIn({ onDismiss }: { onDismiss?: () => void }) {
  const theme = useTheme();
  const { updateSettings } = useHabits();
  return (
    <ThemedView type="accentSoft" style={styles.card}>
      <View style={styles.row}>
        <ThemedText style={styles.icon}>🧠</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Meet your AI coach</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {COACH_ABOUT}
          </ThemedText>
        </View>
      </View>
      <Pressable
        onPress={() => updateSettings({ coach: true, coachAsked: true })}
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: theme.accent }]}>
        <ThemedText type="smallBold" themeColor="onAccent">
          Turn on AI coach
        </ThemedText>
      </Pressable>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={8} style={styles.center}>
          <ThemedText type="small" themeColor="textSecondary">
            Not now
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

function Pending({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, styles.row]}>
      <ActivityIndicator color={theme.accent} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {text}
      </ThemedText>
    </ThemedView>
  );
}

function Failed({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, styles.row]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {busy
          ? 'Your coach is busy right now.'
          : 'Couldn’t reach your coach. Check your connection.'}
      </ThemedText>
      <Pressable onPress={onRetry} hitSlop={8}>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          Try again
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

/** Dashboard: today's nudge, or the one-time offer to turn the coach on. */
export function CoachNudge({ today }: { today: string }) {
  const theme = useTheme();
  const cloud = useCloud();
  const { settings, updateSettings, habits } = useHabits();
  const { state, message, retry } = useCoach('daily', today);

  if (!cloud.configured || !habits.length) return null;
  if (!settings.coach)
    return settings.coachAsked ? null : (
      <CoachOptIn onDismiss={() => updateSettings({ coachAsked: true })} />
    );
  if (state === 'loading') return <Pending text="Your coach is reading your last two weeks…" />;
  if (state === 'failed' || state === 'busy')
    return <Failed busy={state === 'busy'} onRetry={retry} />;
  if (state !== 'ready' || !message) return null;

  return (
    <Animated.View entering={FadeIn}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.row}>
          <ThemedText style={styles.icon}>🧠</ThemedText>
          <View style={styles.flex}>
            <ThemedText type="smallBold">{message.title}</ThemedText>
            <ThemedText type="small">{message.body}</ThemedText>
          </View>
        </View>
        {message.tip && (
          <ThemedView type="accentSoft" style={styles.tip}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              💡 {message.tip}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>
    </Animated.View>
  );
}

function Report({ message, kind }: { message: CoachMessage; kind: 'weekly' | 'monthly' }) {
  const theme = useTheme();
  const range = `${fmtDay(message.range_start, { month: 'short', day: 'numeric' })} – ${fmtDay(
    message.range_end,
    { month: 'short', day: 'numeric' }
  )}`;
  return (
    <Animated.View entering={FadeIn}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View>
          <ThemedText type="small" themeColor="textSecondary">
            {range}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.reportTitle}>
            {message.title}
          </ThemedText>
        </View>
        <ThemedText type="small">{message.body}</ThemedText>
        {message.highlights.length > 0 && (
          <View style={[styles.highlights, { borderColor: theme.backgroundSelected }]}>
            {message.highlights.map((h, i) => (
              <View key={i} style={styles.row}>
                <ThemedText style={styles.highlightIcon}>{h.emoji}</ThemedText>
                <ThemedText type="small" style={styles.flex}>
                  {h.text}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
        {message.tip && (
          <ThemedView type="accentSoft" style={styles.tip}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              🎯 {kind === 'weekly' ? 'This week' : 'This month'}: {message.tip}
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>
    </Animated.View>
  );
}

/** Progress Report: the AI weekly / monthly reflection. */
export function CoachReport({ today }: { today: string }) {
  const cloud = useCloud();
  const { settings, habits } = useHabits();
  const [kind, setKind] = useState<'weekly' | 'monthly'>('weekly');
  const { state, message, retry } = useCoach(kind, today);

  if (!cloud.configured || !habits.length || state === 'off') return null;
  if (!settings.coach) return <CoachOptIn />;

  return (
    <View style={styles.report}>
      <Segmented
        options={[
          { value: 'weekly', label: 'This week' },
          { value: 'monthly', label: 'This month' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {state === 'loading' ? (
        <Pending
          text={`Your coach is writing your ${kind === 'weekly' ? 'weekly' : 'monthly'} report…`}
        />
      ) : state === 'failed' || state === 'busy' ? (
        <Failed busy={state === 'busy'} onRetry={retry} />
      ) : message ? (
        <Report message={message} kind={kind} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
  },
  icon: {
    fontSize: 24,
    lineHeight: 30,
  },
  button: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 4,
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
  },
  tip: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  report: {
    gap: Spacing.two + 2,
  },
  reportTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  highlights: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two + 2,
    gap: Spacing.two,
  },
  highlightIcon: {
    fontSize: 16,
    lineHeight: 22,
  },
});
