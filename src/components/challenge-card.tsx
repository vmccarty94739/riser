import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  challengeDays,
  challengeStatus,
  dayKey,
  motivation,
  trophyOf,
  useHabits,
  type Challenge,
  type Habit,
} from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { iconText } from '@/lib/icons';
import { challengeXp, habitCountOn } from '@/lib/xp';

type Entry = { challenge: Challenge; habit: Habit | undefined };

function summarize({ challenge, habit }: Entry) {
  const days = challengeDays(challenge, habit);
  const status = challengeStatus(challenge, habit);
  const doneCount = days.filter((d) => d.state === 'done').length;
  const todayIndex = days.findIndex((d) => d.state === 'today');
  const notStarted = days.every((d) => d.state === 'upcoming');
  return {
    days,
    status,
    doneCount,
    todayIndex,
    notStarted,
    todayDone: todayIndex === -1 && !notStarted && status === 'active',
    left: challenge.length - doneCount,
  };
}

/** One challenge in full, or several condensed into a single card. */
export function Challenges({ entries }: { entries: Entry[] }) {
  if (entries.length === 1) return <ChallengeCard {...entries[0]} />;
  return <ChallengeStack entries={entries} />;
}

/** Progress toward a trophy, with a daily motivation line and restart/dismiss when it slips. */
export function ChallengeCard({ challenge, habit }: Entry) {
  const theme = useTheme();
  const { habits, startChallenge, dismissChallenge } = useHabits();
  const trophy = trophyOf(challenge);
  const { days, status, doneCount, todayIndex, notStarted, todayDone, left } = summarize({
    challenge,
    habit,
  });
  const dayNumber = todayIndex >= 0 ? todayIndex + 1 : doneCount;
  const lost = status === 'lost';

  const progress = lost
    ? `Slipped on day ${days.findIndex((d) => d.state === 'missed') + 1}. Every streak starts at one.`
    : notStarted
      ? 'Starts tomorrow.'
      : todayDone
        ? `Day ${dayNumber} locked in. See you tomorrow.`
        : dayNumber === challenge.length
          ? 'Final day. Finish it and the trophy is yours.'
          : `Day ${dayNumber} of ${challenge.length}. Today’s still open.`;

  return (
    <Animated.View entering={FadeIn}>
      <ThemedView
        type={lost ? 'backgroundElement' : 'goldSoft'}
        style={[styles.card, !lost && { borderColor: theme.gold }]}>
        <View style={styles.header}>
          <ThemedText style={[styles.icon, lost && styles.dim]}>
            {lost ? '💔' : trophy.icon}
          </ThemedText>
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={{ color: lost ? theme.textSecondary : theme.gold }}>
              {trophy.name.toUpperCase()} · {challenge.length} DAYS
            </ThemedText>
            <ThemedText numberOfLines={1}>
              {iconText(challenge.habitEmoji)} {challenge.habitName}
            </ThemedText>
          </View>
          <View style={styles.reward}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {doneCount}/{challenge.length}
            </ThemedText>
            {!lost && (
              <ThemedText type="small" style={[styles.rewardXp, { color: theme.gold }]}>
                +{challengeXp(challenge, habitCountOn(habits, dayKey()))} XP
              </ThemedText>
            )}
          </View>
        </View>

        {challenge.length <= 14 ? (
          <View style={styles.pips}>
            {days.map((d, i) => (
              <View
                key={d.day}
                style={[
                  styles.pip,
                  challenge.length > 7 && styles.pipSmall,
                  {
                    backgroundColor:
                      d.state === 'done'
                        ? theme.gold
                        : d.state === 'missed'
                          ? theme.danger
                          : theme.backgroundSelected,
                  },
                  d.state === 'today' && { borderWidth: 2, borderColor: theme.gold },
                ]}>
                {challenge.length <= 7 && (
                  <ThemedText
                    type="small"
                    style={[
                      styles.pipLabel,
                      {
                        color:
                          d.state === 'done'
                            ? theme.onGold
                            : d.state === 'missed'
                              ? theme.onDanger
                              : theme.textSecondary,
                      },
                    ]}>
                    {d.state === 'done' ? '✓' : i + 1}
                  </ThemedText>
                )}
              </View>
            ))}
          </View>
        ) : (
          <ProgressBar value={doneCount / challenge.length} color={theme.gold} />
        )}

        <View style={styles.copy}>
          <ThemedText type="small" themeColor="textSecondary">
            {progress}
          </ThemedText>
          {!lost && (
            <ThemedText type="small" style={styles.motivation}>
              {motivation(challenge, left)}
            </ThemedText>
          )}
        </View>

        {lost && habit && (
          <View style={styles.actions}>
            <Pressable onPress={() => dismissChallenge(challenge.id)} style={styles.action}>
              <ThemedText type="small" themeColor="textSecondary">
                Dismiss
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() =>
                startChallenge(challenge.habitId, challenge.length, { title: challenge.title })
              }
              style={[styles.action, { backgroundColor: theme.accent }]}>
              <ThemedText type="smallBold" themeColor="onAccent">
                Restart today
              </ThemedText>
            </Pressable>
          </View>
        )}
      </ThemedView>
    </Animated.View>
  );
}

/** Several challenges in one compact card: one row each, one motivation line. */
function ChallengeStack({ entries }: { entries: Entry[] }) {
  const theme = useTheme();
  const { startChallenge } = useHabits();
  const rows = entries.map((e) => ({ ...e, ...summarize(e) }));
  // Motivate toward the trophy that's closest.
  const focus = rows
    .filter((r) => r.status === 'active' && !r.notStarted)
    .sort((a, b) => a.left - b.left)[0];

  return (
    <Animated.View entering={FadeIn}>
      <ThemedView type="goldSoft" style={[styles.card, styles.stack, { borderColor: theme.gold }]}>
        <View style={styles.stackHeader}>
          <ThemedText type="smallBold" style={{ color: theme.gold }}>
            {entries.length} challenges in play
          </ThemedText>
        </View>
        {rows.map((r) => {
          const trophy = trophyOf(r.challenge);
          const lost = r.status === 'lost';
          return (
            <Pressable
              key={r.challenge.id}
              onPress={() => router.push(`/habit/${r.challenge.habitId}`)}
              style={styles.stackRow}>
              <ThemedText style={[styles.stackIcon, lost && styles.dim]}>
                {lost ? '💔' : trophy.icon}
              </ThemedText>
              <View style={styles.flex}>
                <ThemedText type="small" numberOfLines={1}>
                  <ThemedText type="smallBold">{trophy.name}</ThemedText> ·{' '}
                  {iconText(r.challenge.habitEmoji)} {r.challenge.habitName}
                </ThemedText>
                {lost ? (
                  <ThemedText type="small" style={{ color: theme.danger, fontSize: 12 }}>
                    Slipped
                  </ThemedText>
                ) : (
                  <ProgressBar value={r.doneCount / r.challenge.length} color={theme.gold} thin />
                )}
              </View>
              {lost && r.habit ? (
                <Pressable
                  onPress={() =>
                    startChallenge(r.challenge.habitId, r.challenge.length, {
                      title: r.challenge.title,
                    })
                  }
                  hitSlop={8}
                  style={[styles.restart, { backgroundColor: theme.accent }]}>
                  <ThemedText type="small" themeColor="onAccent" style={styles.restartText}>
                    Restart
                  </ThemedText>
                </Pressable>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
                  {r.notStarted
                    ? 'Tmrw'
                    : r.todayDone
                      ? `${r.doneCount}/${r.challenge.length} ✓`
                      : `${r.doneCount}/${r.challenge.length}`}
                </ThemedText>
              )}
            </Pressable>
          );
        })}
        {focus && (
          <ThemedText type="small" style={styles.motivation}>
            {motivation(focus.challenge, focus.left)}
          </ThemedText>
        )}
      </ThemedView>
    </Animated.View>
  );
}

function ProgressBar({ value, color, thin }: { value: number; color: string; thin?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.bar, thin && styles.barThin, { backgroundColor: theme.backgroundSelected }]}>
      <View
        style={[
          styles.barFill,
          { backgroundColor: color, width: `${Math.max(0, Math.min(1, value)) * 100}%` },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  stack: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    fontSize: 30,
    lineHeight: 36,
  },
  dim: {
    opacity: 0.7,
  },
  flex: {
    flex: 1,
  },
  pips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  pipLabel: {
    fontWeight: 700,
  },
  bar: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barThin: {
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  copy: {
    gap: Spacing.half,
  },
  motivation: {
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  stackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one,
  },
  stackIcon: {
    fontSize: 22,
    lineHeight: 28,
  },
  reward: {
    alignItems: 'flex-end',
  },
  rewardXp: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
  },
  count: {
    minWidth: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  restart: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  restartText: {
    fontSize: 12,
    fontWeight: 700,
  },
});
