import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Heatmap, SegmentedBars } from '@/components/charts';
import { Chip } from '@/components/habit-fields';
import { HabitIcon } from '@/components/habit-icon';
import { InfoButton } from '@/components/info-button';
import { LevelCard } from '@/components/level-bar';
import { ScreenScroll } from '@/components/screen-scroll';
import { SectionHeading, useFold } from '@/components/section-heading';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { readableText, Spacing } from '@/constants/theme';
import {
  activeOn,
  addDays,
  challengeDays,
  challengeStatus,
  countOn,
  currentChallenge,
  currentStreak,
  dayKey,
  dayScore,
  daysBetween,
  daysDone,
  fmtDay,
  isDone,
  lastDays,
  longestPerfectStreak,
  tally,
  tierFor,
  trophyOf,
  TROPHY_TIERS,
  useHabits,
  type Challenge,
  type Habit,
  type HabitKind,
} from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { iconText } from '@/lib/icons';
import { COACH_ABOUT, CoachReport } from '@/components/coach-cards';
import { COACH_ENGINE } from '@/lib/coach';
import { useCloud } from '@/hooks/use-cloud';
import { habitCountOn, tierXp, wonXp } from '@/lib/xp';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.tile}>
      <ThemedText type="subtitle" style={styles.tileValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
      {note && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.tileNote}>
          {note}
        </ThemedText>
      )}
    </ThemedView>
  );
}

/** One habit's shelf: its own trophy ladder, what it has earned, and what's next. */
function HabitShelf({
  habit,
  habits,
  challenges,
}: {
  habit: Habit;
  habits: Habit[];
  challenges: Challenge[];
}) {
  const theme = useTheme();
  const count = habitCountOn(habits, dayKey());
  const won = challenges.filter((c) => c.habitId === habit.id && c.completedAt);
  const earned = new Set(won.filter((c) => !c.custom).map((c) => tierFor(c.length).days));
  const nextTier = TROPHY_TIERS.find((t) => !earned.has(t.days));
  const live = currentChallenge(challenges, habit.id);
  const active = live && challengeStatus(live, habit) === 'active' ? live : null;
  const done = active ? challengeDays(active, habit).filter((d) => d.state === 'done').length : 0;
  const xp = won.reduce((sum, c) => sum + wonXp(c, habits), 0);

  return (
    <Pressable
      onPress={() => router.push(`/habit/${habit.id}`)}
      style={[styles.shelf, { backgroundColor: theme.background }]}>
      <View style={styles.shelfTop}>
        <HabitIcon icon={habit.emoji} size={22} quit={habit.kind === 'quit'} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {habit.name}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.trophyMeta}
            numberOfLines={1}>
            {nextTier
              ? active && tierFor(active.length).days === nextTier.days
                ? `${nextTier.icon} ${nextTier.name} · ${done}/${nextTier.days} days · +${tierXp(nextTier.days, count)} XP`
                : `Next: ${nextTier.icon} ${nextTier.name} · +${tierXp(nextTier.days, count)} XP`
              : '🐉 Every tier earned'}
          </ThemedText>
        </View>
        <View style={styles.shelfStats}>
          <ThemedText type="smallBold" style={{ color: theme.gold }}>
            {won.length} 🏆
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.trophyMeta}>
            {xp.toLocaleString()} XP
          </ThemedText>
        </View>
      </View>
      <View style={styles.medals}>
        {TROPHY_TIERS.map((t) => {
          const has = earned.has(t.days);
          const isNext = t.days === nextTier?.days;
          return (
            <View
              key={t.days}
              style={[
                styles.medal,
                { backgroundColor: has ? theme.goldSoft : 'transparent' },
                isNext && { borderColor: theme.gold, borderWidth: 1.5 },
              ]}>
              <ThemedText
                style={[
                  styles.medalIcon,
                  !has && !isNext && styles.medalLocked,
                  isNext && styles.medalNext,
                ]}>
                {t.icon}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

/** Trophy cabinet for one side (good or bad): a ladder per habit, then retired and custom trophies. */
function Cabinet({
  kind,
  habits,
  challenges,
}: {
  kind: HabitKind;
  habits: Habit[];
  challenges: Challenge[];
}) {
  const theme = useTheme();
  const [all, setAll] = useState(false);
  const mine = challenges.filter((c) => c.completedAt && c.habitKind === kind);
  const shelves = habits
    .filter((h) => h.kind === kind)
    .map((h) => ({ h, count: mine.filter((c) => c.habitId === h.id).length }))
    .sort((a, b) => b.count - a.count)
    .map((x) => x.h);
  const retired = mine.filter((c) => !habits.some((h) => h.id === c.habitId));
  const custom = mine.filter((c) => c.custom && habits.some((h) => h.id === c.habitId));
  const shown = all ? shelves : shelves.slice(0, 3);
  const hidden = shelves.length - shown.length + (all ? 0 : retired.length + custom.length);

  if (!shelves.length && !retired.length) {
    return (
      <ThemedView type="goldSoft" style={styles.cabinet}>
        <ThemedText type="small" themeColor="textSecondary">
          Add a {kind === 'quit' ? 'habit to quit' : 'habit'} and start a challenge to fill this
          shelf.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="goldSoft" style={styles.cabinet}>
      {shown.map((h) => (
        <HabitShelf key={h.id} habit={h} habits={habits} challenges={challenges} />
      ))}

      {all && custom.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.customLabel}>
            CUSTOM TROPHIES
          </ThemedText>
          {custom.map((c) => (
            <TrophyLine key={c.id} challenge={c} habits={habits} />
          ))}
        </>
      )}
      {all && retired.length > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.customLabel}>
            FROM DELETED HABITS
          </ThemedText>
          {retired.map((c) => (
            <TrophyLine key={c.id} challenge={c} habits={habits} />
          ))}
        </>
      )}

      {(hidden > 0 || all) && (
        <Pressable onPress={() => setAll((a) => !a)} style={styles.viewAll} hitSlop={6}>
          <ThemedText type="smallBold" style={{ color: theme.gold }}>
            {all ? 'Show less' : `View all (${hidden} more)`}
          </ThemedText>
          <ThemedText style={[styles.viewAllArrow, { color: theme.gold }, all && styles.arrowUp]}>
            ›
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

function TrophyLine({ challenge, habits }: { challenge: Challenge; habits: Habit[] }) {
  const theme = useTheme();
  const t = trophyOf(challenge);
  return (
    <View style={[styles.trophyRow, { backgroundColor: theme.background }]}>
      <ThemedText style={styles.trophyIcon}>{t.icon}</ThemedText>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{t.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.trophyMeta}>
          {challenge.length} days · {iconText(challenge.habitEmoji)} {challenge.habitName} · +
          {wonXp(challenge, habits)} XP
        </ThemedText>
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  const theme = useTheme();
  const { habits, challenges, settings } = useHabits();
  const coachFold = useFold('progress:coach');
  const trophyFold = useFold('progress:trophies');
  const graphFold = useFold('progress:graph');
  const calendarFold = useFold('progress:calendar');
  const reportFold = useFold('progress:report-card');
  const historyFold = useFold('progress:history');
  const [kind, setKind] = useState<HabitKind>('build');
  const [range, setRange] = useState<Range>(7);
  const [historyDays, setHistoryDays] = useState(7);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const today = dayKey();
  const cloud = useCloud();
  const quit = kind === 'quit';
  const list = habits.filter((h) => h.kind === kind);

  const switchKind = (k: HabitKind) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setKind(k);
    setOpenDay(null);
  };

  const selector = (
    <View style={styles.kindRow}>
      {(
        [
          { k: 'build', label: 'Good habits', color: theme.success, soft: theme.successSoft },
          { k: 'quit', label: 'Bad habits', color: theme.danger, soft: theme.dangerSoft },
        ] as const
      ).map(({ k, label, color, soft }) => {
        const selected = kind === k;
        return (
          <Pressable
            key={k}
            onPress={() => switchKind(k)}
            style={[
              styles.kindButton,
              { backgroundColor: selected ? color : soft, borderColor: color },
            ]}>
            <ThemedText type="smallBold" style={{ color: selected ? readableText(color) : color }}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  const days = lastDays(range).map((d) => dayKey(d));
  const prevDays = days.map((d) => addDays(d, -range));
  const current = tally(list, days);
  const previous = tally(list, prevDays);
  const rate = current.possible ? current.met / current.possible : null;
  const prevRate = previous.possible ? previous.met / previous.possible : null;
  const delta = rate !== null && prevRate !== null ? Math.round((rate - prevRate) * 100) : null;
  const allDays = days.filter((d) => dayScore(list, d) === 1).length;
  const longestKind = longestPerfectStreak(list);

  const earliest = list.reduce((min, h) => (h.createdAt < min ? h.createdAt : min), today);
  const totalDays = daysBetween(earliest, today) + 1;
  const history = Array.from({ length: Math.min(historyDays, totalDays) }, (_, i) =>
    addDays(today, -i)
  );

  return (
    <ScreenScroll title="Progress Report" subtitle="Your consistency" action={<SettingsButton />}>
      <LevelCard />
      {habits.length > 0 && (COACH_ENGINE === 'device' ? !settings.coachOff : cloud.configured) && (
        <>
          <SectionHeading
            title="Coach's Report"
            accessory={<InfoButton title="Coach's Report" text={COACH_ABOUT} />}
            {...coachFold}
          />
          {coachFold.open && <CoachReport today={today} />}
        </>
      )}

      {selector}

      <SectionHeading
        title="Trophy Cabinet"
        accessory={
          <InfoButton
            title="Trophy Cabinet"
            text={`Every habit has its own trophy ladder, from 🥉 Kickstart (3 days) to 🐉 Legend (365). Finishing a challenge earns that habit its trophy plus XP toward your level, and the next rung starts the following day. So every habit you add is a fresh climb. The outlined trophy is each habit's next one. This cabinet shows your ${
              quit ? 'bad' : 'good'
            } habits; tap a shelf to open the habit, or View all for custom trophies and trophies from deleted habits.`}
          />
        }
        trailing={
          <ThemedText type="small" themeColor="textSecondary">
            {challenges.filter((c) => c.completedAt && c.habitKind === kind).length} earned
          </ThemedText>
        }
        {...trophyFold}
      />
      {trophyFold.open && <Cabinet kind={kind} habits={habits} challenges={challenges} />}

      {!list.length ? (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          {quit
            ? 'No bad habits yet. Add one from the Break tab on your Dashboard to track clean days.'
            : 'Add a habit on your Dashboard and your trends will show up here.'}
        </ThemedText>
      ) : (
        <>
          <SectionHeading
            title="Graph"
            accessory={
              <InfoButton
                title="Graph"
                text={`Pick 7, 30 or 90 days. The tiles sum up that period and compare it to the one before. In the chart each bar is a day, week or month, split by habit category: the solid part is what you ${
                  quit ? 'logged clean' : 'completed'
                }, the faded part is what you missed. Tap a bar or a category for a breakdown. ${
                  quit ? 'Longest clean run' : 'Longest perfect streak'
                } counts the most days in a row where every ${
                  quit ? 'bad habit was avoided' : 'good habit was done'
                }.`}
              />
            }
            {...graphFold}
          />
          {graphFold.open && (
            <>
              <View style={styles.chips}>
                {RANGES.map((r) => (
                  <Chip
                    key={r}
                    label={`${r} days`}
                    selected={range === r}
                    onPress={() => setRange(r)}
                  />
                ))}
              </View>

              <View style={styles.tiles}>
                <StatTile
                  label={quit ? 'Clean rate' : 'Consistency'}
                  value={rate === null ? '—' : `${Math.round(rate * 100)}%`}
                  note={
                    delta === null
                      ? undefined
                      : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)} pts vs prior`
                  }
                />
                <StatTile
                  label={quit ? 'Longest clean run' : 'Longest perfect streak'}
                  value={`🔥 ${longestKind}`}
                  note={longestKind === 1 ? 'day' : 'days'}
                />
                <StatTile label={quit ? 'Fully clean days' : 'All-done days'} value={allDays} />
              </View>

              <ThemedView type="backgroundElement" style={styles.card}>
                <SegmentedBars key={`${kind}-${range}`} habits={habits} kind={kind} range={range} />
              </ThemedView>
            </>
          )}

          <SectionHeading
            title="Calendar"
            accessory={
              <InfoButton
                title="Calendar"
                text={`Your last 16 weeks, day by day. The stronger a day's color, the more of your ${
                  quit ? 'bad habits you stayed clean from' : 'good habits you completed'
                }: white means none, full color means all of them. Today is outlined.`}
              />
            }
            {...calendarFold}
          />
          {calendarFold.open && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <Heatmap
                habits={list}
                caption={
                  quit
                    ? 'Share of bad habits avoided each day'
                    : 'Share of good habits done each day'
                }
              />
            </ThemedView>
          )}

          <SectionHeading
            title={`Habit Summary: Past ${range} Days`}
            accessory={
              <InfoButton
                title="Habit Summary"
                text={`How each habit did in the period you picked: ${
                  quit ? 'clean days' : 'days completed'
                } out of the days it existed, the bar showing that share, and 🔥 its current streak. Tap a habit to open it.`}
              />
            }
            {...reportFold}
          />
          {reportFold.open && (
            <ThemedView type="backgroundElement" style={styles.list}>
              {list.map((habit, i) => {
                const { done, possible } = daysDone(habit, range);
                const streak = currentStreak(habit);
                return (
                  <Pressable
                    key={habit.id}
                    onPress={() => router.push(`/habit/${habit.id}`)}
                    style={[
                      styles.habitRow,
                      i > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderColor: theme.backgroundSelected,
                      },
                    ]}>
                    <HabitIcon icon={habit.emoji} size={20} quit={quit} />
                    <View style={styles.flex}>
                      <View style={styles.rowHeader}>
                        <ThemedText
                          type="small"
                          numberOfLines={1}
                          style={[styles.flex, styles.rowName]}>
                          {habit.name}
                        </ThemedText>
                        <ThemedText type="smallBold" style={styles.rowCount}>
                          {done}/{possible}
                          <ThemedText
                            type="small"
                            style={[
                              styles.rowUnit,
                              { color: quit ? theme.success : theme.textSecondary },
                            ]}>
                            {quit ? ' clean' : ' days'}
                          </ThemedText>
                        </ThemedText>
                      </View>
                      <View style={styles.rowBar}>
                        <View
                          style={[
                            styles.track,
                            styles.flex,
                            { backgroundColor: theme.backgroundSelected },
                          ]}>
                          <View
                            style={[
                              styles.fill,
                              {
                                backgroundColor: theme.accent,
                                width: `${possible ? (done / possible) * 100 : 0}%`,
                              },
                            ]}
                          />
                        </View>
                        <ThemedText
                          type="small"
                          themeColor="textSecondary"
                          style={styles.rowStreak}>
                          {streak > 0 ? `🔥 ${streak}` : '—'}
                        </ThemedText>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ThemedView>
          )}

          <SectionHeading
            title="History"
            accessory={
              <InfoButton
                title="History"
                text={`Every day you've tracked, newest first, with how many habits you ${
                  quit ? 'stayed clean from' : 'completed'
                }. Faded icons are the ones you missed. Tap a day to see each habit's result.`}
              />
            }
            {...historyFold}
          />
          {historyFold.open && (
            <ThemedView type="backgroundElement" style={styles.list}>
              {history.map((day, i) => {
                const active = activeOn(list, day);
                const doneCount = active.filter((h) => isDone(h, day)).length;
                const expanded = openDay === day;
                const allDone = active.length > 0 && doneCount === active.length;
                return (
                  <View
                    key={day}
                    style={
                      i > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderColor: theme.backgroundSelected,
                      }
                    }>
                    <Pressable
                      onPress={() => setOpenDay(expanded ? null : day)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      style={styles.historyRow}>
                      <View style={styles.historyDate}>
                        <ThemedText type="smallBold">
                          {day === today
                            ? 'Today'
                            : day === addDays(today, -1)
                              ? 'Yesterday'
                              : fmtDay(day, { weekday: 'short' })}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          themeColor="textSecondary"
                          style={styles.historySub}>
                          {fmtDay(day, { month: 'short', day: 'numeric' })}
                        </ThemedText>
                      </View>
                      <View style={styles.historyIcons}>
                        {active.slice(0, 7).map((h) => (
                          <View key={h.id} style={!isDone(h, day) && styles.missedIcon}>
                            <HabitIcon icon={h.emoji} size={17} />
                          </View>
                        ))}
                        {active.length > 7 && (
                          <ThemedText type="small" themeColor="textSecondary">
                            +{active.length - 7}
                          </ThemedText>
                        )}
                      </View>
                      <ThemedText
                        type="smallBold"
                        style={{ color: allDone ? theme.success : theme.textSecondary }}>
                        {doneCount}/{active.length}
                      </ThemedText>
                      <View style={[styles.chevronWrap, { backgroundColor: theme.background }]}>
                        <ThemedText
                          themeColor="textSecondary"
                          style={[styles.chevron, expanded && styles.chevronOpen]}>
                          ›
                        </ThemedText>
                      </View>
                    </Pressable>
                    {expanded && (
                      <Animated.View entering={FadeIn} style={styles.historyDetail}>
                        {active.map((h) => {
                          const count = countOn(h, day);
                          const done = isDone(h, day);
                          return (
                            <View key={h.id} style={styles.detailRow}>
                              <HabitIcon icon={h.emoji} size={16} />
                              <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                                {h.name}
                              </ThemedText>
                              <ThemedText
                                type="small"
                                style={{
                                  color: done ? theme.success : theme.textSecondary,
                                  fontWeight: done ? 700 : 500,
                                }}>
                                {quit
                                  ? done
                                    ? 'Clean ✓'
                                    : 'Not logged'
                                  : h.target > 1
                                    ? `${count}/${h.target}`
                                    : done
                                      ? 'Done ✓'
                                      : 'Missed'}
                              </ThemedText>
                            </View>
                          );
                        })}
                      </Animated.View>
                    )}
                  </View>
                );
              })}
              {historyDays < totalDays && (
                <Pressable
                  onPress={() => setHistoryDays((d) => d + 14)}
                  style={[styles.more, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    Show earlier days
                  </ThemedText>
                </Pressable>
              )}
            </ThemedView>
          )}
        </>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  kindRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kindButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    paddingVertical: Spacing.two + 2,
  },
  cabinet: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  shelf: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  shelfTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  shelfStats: {
    alignItems: 'flex-end',
  },
  medals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  medal: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalIcon: {
    fontSize: 17,
    lineHeight: 22,
  },
  medalLocked: {
    opacity: 0.18,
  },
  medalNext: {
    opacity: 0.6,
  },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  trophyIcon: {
    fontSize: 30,
    lineHeight: 38,
    width: 38,
    textAlign: 'center',
  },
  locked: {
    opacity: 0.4,
    fontSize: 22,
  },
  trophyMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  check: {
    fontSize: 18,
    fontWeight: 800,
  },
  customLabel: {
    marginTop: Spacing.one,
    fontSize: 11,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.one,
  },
  viewAllArrow: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: 600,
    transform: [{ rotate: '90deg' }],
  },
  arrowUp: {
    transform: [{ rotate: '-90deg' }],
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    alignItems: 'center',
  },
  tileValue: {
    fontSize: 26,
    lineHeight: 34,
  },
  tileNote: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  list: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  rowName: {
    fontSize: 14,
    lineHeight: 18,
  },
  rowCount: {
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  rowUnit: {
    fontSize: 12,
    fontWeight: 600,
  },
  rowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 3,
  },
  rowStreak: {
    fontSize: 11,
    lineHeight: 14,
    minWidth: 34,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.two + Spacing.one,
  },
  historyDate: {
    width: 72,
  },
  historySub: {
    fontSize: 12,
    lineHeight: 16,
  },
  historyIcons: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  missedIcon: {
    opacity: 0.2,
  },
  chevronWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: 600,
    transform: [{ rotate: '90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '-90deg' }],
  },
  historyDetail: {
    paddingBottom: Spacing.two + Spacing.one,
    paddingLeft: 72 + Spacing.two,
    gap: Spacing.one + 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  more: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
});
