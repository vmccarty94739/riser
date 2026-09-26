import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Segmented } from '@/components/habit-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCloud } from '@/hooks/use-cloud';
import { useCoach } from '@/hooks/use-coach';
import { useVisitCoach } from '@/hooks/use-coach-visit';
import { fmtDay, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { COACH_ENGINE, type CoachKind, type CoachMessage } from '@/lib/coach';
import { DEVICE_MODEL_NAME } from '@/lib/coach-device';

const onDevice = COACH_ENGINE === 'device';

/** Shown in ⓘ (and the Claude opt-in): what the coach does and where the data goes. */
export const COACH_ABOUT = onDevice
  ? `Your coach studies your streaks and check-ins for patterns, like a habit you’re crushing next to one that’s slipping, or a weekday that keeps going wrong, and gives you fresh coaching each time you open the app, an afternoon tip, plus a weekly and monthly report. On phones with ${DEVICE_MODEL_NAME}, the AI built into your phone writes it; otherwise it’s put together from your numbers. Everything stays on your phone. You can turn the coach off in Settings.`
  : 'Your coach reads your streaks and check-ins and writes you a personal nudge each day, plus a weekly and monthly report. It’s written by AI (Anthropic’s Claude). To do that, your habit names and check-in history are sent to Anthropic. Nothing else is shared, and you can turn the coach off anytime in Settings.';

/** Who wrote a message, in a few words. */
function Byline({ message }: { message: Pick<CoachMessage, 'source'> }) {
  if (!message.source || message.source === 'rules') return null;
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.byline}>
      {message.source === 'claude'
        ? '✨ Written by Claude'
        : `✨ Written privately on your phone by ${DEVICE_MODEL_NAME}`}
    </ThemedText>
  );
}

/** Whether the coach shows at all (on-device it only needs to be switched on). */
function useCoachVisible() {
  const cloud = useCloud();
  const { settings, habits } = useHabits();
  if (!habits.length) return false;
  return onDevice ? !settings.coachOff : cloud.configured;
}

/** Asks before any habit data goes to the AI coach (App Store rule for third-party AI). */
export function CoachOptIn({ onDismiss }: { onDismiss?: () => void }) {
  const theme = useTheme();
  const { updateSettings } = useHabits();
  return (
    <ThemedView type="accentSoft" style={styles.card}>
      <View style={styles.row}>
        <ThemedText style={styles.icon}>🧑‍🏫</ThemedText>
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

type NudgeContent = Pick<CoachMessage, 'title' | 'body' | 'tip' | 'source'>;

/** A piece of coaching: what the coach noticed, and a tip for it. */
function Nudge({ message, onDismiss }: { message: NudgeContent; onDismiss?: () => void }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.row}>
          <ThemedText style={styles.icon}>🧑‍🏫</ThemedText>
          <View style={styles.flex}>
            {onDismiss && (
              <View style={styles.labelRow}>
                <ThemedText type="small" style={[styles.label, { color: theme.accent }]}>
                  YOUR COACH
                </ThemedText>
                <Pressable
                  onPress={onDismiss}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Hide coach tip">
                  <ThemedText themeColor="textSecondary" style={styles.close}>
                    ✕
                  </ThemedText>
                </Pressable>
              </View>
            )}
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
        <Byline message={message} />
      </ThemedView>
    </Animated.View>
  );
}

/** Dashboard: fresh coaching each time the user opens the app; ✕ hides it until the next visit. */
export function CoachVisitCard() {
  const { coach, dismiss } = useVisitCoach();
  if (!coach || coach.dismissed) return null;
  if (coach.writing) return <Pending text="Your coach is looking at your habits…" />;
  return <Nudge message={coach} onDismiss={dismiss} />;
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
        <View style={styles.row}>
          <ThemedText style={styles.icon}>🧑‍🏫</ThemedText>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              {range}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.reportTitle}>
              {message.title}
            </ThemedText>
          </View>
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
        <Byline message={message} />
      </ThemedView>
    </Animated.View>
  );
}

/** Progress Report: today's nudge and the weekly / monthly reflection. */
export function CoachReport({ today }: { today: string }) {
  const { settings } = useHabits();
  const visible = useCoachVisible();
  const [kind, setKind] = useState<CoachKind>('daily');
  // On-device, "Today" is this visit's coaching (fresh each time the app is opened).
  const visitMode = onDevice && kind === 'daily';
  const { state, message, retry } = useCoach(kind, today, { enabled: !visitMode });
  const { coach } = useVisitCoach();

  if (!visible || state === 'off') return null;
  if (!onDevice && !settings.coach) return <CoachOptIn />;

  return (
    <View style={styles.report}>
      <Segmented
        options={[
          { value: 'daily', label: 'Today' },
          { value: 'weekly', label: 'This week' },
          { value: 'monthly', label: 'This month' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {visitMode ? (
        coach?.writing ? (
          <Pending text="Your coach is looking at your habits…" />
        ) : coach ? (
          <Nudge message={coach} />
        ) : null
      ) : state === 'loading' ? (
        <Pending
          text={
            kind === 'daily'
              ? 'Your coach is looking at your last two weeks…'
              : `Your coach is writing your ${kind === 'weekly' ? 'weekly' : 'monthly'} report…`
          }
        />
      ) : state === 'failed' || state === 'busy' ? (
        <Failed busy={state === 'busy'} onRetry={retry} />
      ) : message ? (
        kind === 'daily' ? (
          <Nudge message={message} />
        ) : (
          <Report message={message} kind={kind} />
        )
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
  byline: {
    fontSize: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    letterSpacing: 0.8,
  },
  close: {
    fontSize: 14,
    lineHeight: 16,
  },
  highlightIcon: {
    fontSize: 16,
    lineHeight: 22,
  },
});
