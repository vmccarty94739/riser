import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Challenges } from '@/components/challenge-card';
import { HabitRow } from '@/components/habit-row';
import { InfoButton } from '@/components/info-button';
import { ScreenScroll } from '@/components/screen-scroll';
import { SectionHeading, useFold } from '@/components/section-heading';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  activeOn,
  addDays,
  challengeStatus,
  currentChallenge,
  currentStreak,
  dayKey,
  fmtDay,
  isDone,
  nextChallengeLength,
  tierFor,
  useHabits,
  type Habit,
  type HabitKind,
} from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { now } from '@/lib/clock';
import { habitCountOn, tierXp } from '@/lib/xp';
import { categoriesFor, categoryOf, iconText } from '@/lib/icons';

function greeting() {
  const h = now().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardScreen() {
  const theme = useTheme();
  const { habits, challenges, loaded, startChallenge, settings, toggleCollapsed } = useHabits();
  const today = dayKey();
  const [offset, setOffset] = useState(0);
  const day = addDays(today, offset);
  const [page, setPage] = useState<0 | 1>(0);
  const [width, setWidth] = useState(0);
  // Each page's natural height, so the pager is only as tall as the page on screen.
  const [heights, setHeights] = useState<[number, number]>([0, 0]);
  const pager = useRef<ScrollView>(null);
  const challengesFold = useFold('dash:challenges');
  const [prompt, setPrompt] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    if (!prompt) return;
    const timer = setTimeout(() => setPrompt(null), 2400);
    return () => clearTimeout(timer);
  }, [prompt]);

  const earliest = habits.reduce((min, h) => (h.createdAt < min ? h.createdAt : min), today);
  const dayHabits = activeOn(habits, day);
  const build = dayHabits.filter((h) => h.kind === 'build');
  const quit = dayHabits.filter((h) => h.kind === 'quit');
  const isToday = offset === 0;

  const warn = (text: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setPrompt({ text, key: Date.now() });
  };
  const move = (delta: number) => {
    if (delta > 0 && isToday) return warn('You can only log current or past events.');
    if (delta < 0 && day <= earliest) return warn('That’s before you started. 🌱');
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setOffset((o) => o + delta);
  };
  const goToPage = (p: 0 | 1) => {
    setPage(p);
    pager.current?.scrollTo({ x: p * width, animated: true });
  };

  const live = habits.flatMap((habit) => {
    const challenge = currentChallenge(challenges, habit.id);
    return challenge && challengeStatus(challenge, habit) !== 'won' ? [{ habit, challenge }] : [];
  });

  // No challenge running: offer the next rung of the ladder on the strongest habit.
  const suggestion =
    live.length === 0 && habits.length > 0
      ? (() => {
          const habit = [...habits].sort((a, b) => currentStreak(b) - currentStreak(a))[0];
          const won = challenges.filter(
            (c) => c.habitId === habit.id && c.completedAt && !c.custom
          );
          const length = won.length
            ? nextChallengeLength(Math.max(...won.map((c) => c.length)))
            : 3;
          return { habit, length, tier: tierFor(length) };
        })()
      : null;

  const renderPage = (list: Habit[], kind: HabitKind, index: 0 | 1) => {
    const sections = categoriesFor(kind)
      .map((c) => ({ ...c, habits: list.filter((h) => categoryOf(kind, h.emoji).key === c.key) }))
      .filter((c) => c.habits.length);
    return (
      <View
        style={[styles.page, { width }]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeights((prev) =>
            prev[index] === h ? prev : index === 0 ? [h, prev[1]] : [prev[0], h]
          );
        }}>
        {sections.map((section) => {
          const key = `${kind}:${section.key}`;
          const collapsed = settings.collapsed.includes(key);
          const done = section.habits.filter((h) => isDone(h, day)).length;
          return (
            <View key={key} style={styles.section}>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                  toggleCollapsed(key);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                style={[styles.sectionHeader, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.sectionIcon}>{section.icon}</ThemedText>
                <ThemedText type="smallBold" style={styles.flex}>
                  {section.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {done}/{section.habits.length}
                </ThemedText>
                <ThemedText
                  themeColor="textSecondary"
                  style={[styles.chevron, !collapsed && styles.chevronOpen]}>
                  ›
                </ThemedText>
              </Pressable>
              {!collapsed && (
                <Animated.View entering={FadeIn} style={styles.rows}>
                  {section.habits.map((habit) => (
                    <HabitRow key={habit.id} habit={habit} day={day} />
                  ))}
                </Animated.View>
              )}
            </View>
          );
        })}
        {!list.length && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {kind === 'quit'
              ? 'Quitting something? Log each clean day here and watch the streak grow.'
              : isToday
                ? 'Add something you want to do every day.'
                : 'No habits existed on this day.'}
          </ThemedText>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/new-habit', params: { kind } })}
          style={[
            styles.addButton,
            { borderColor: kind === 'quit' ? theme.danger : theme.accent },
          ]}>
          <ThemedText style={{ color: kind === 'quit' ? theme.danger : theme.accent }}>
            {kind === 'quit' ? '+ Habit to quit' : '+ New habit'}
          </ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <ScreenScroll title="Dashboard" subtitle={greeting()} action={<SettingsButton />}>
      {habits.length > 0 && (
        <SectionHeading
          title={live.length === 1 ? 'Challenge' : 'Challenges'}
          {...challengesFold}
          accessory={
            <InfoButton
              title="Challenges"
              text="A challenge means doing one habit every day for a set number of days. Every habit has its own trophy ladder. Finish without missing a day to earn that habit's trophy plus XP toward your level, and the next, longer challenge starts the following day. Miss a day and you can restart. Tap + Custom to design your own."
            />
          }
          trailing={
            <Pressable onPress={() => router.push('/new-challenge')} hitSlop={8}>
              <ThemedText type="small" style={{ color: theme.gold, fontWeight: 700 }}>
                + Custom
              </ThemedText>
            </Pressable>
          }
        />
      )}
      {challengesFold.open && live.length > 0 && <Challenges entries={live} />}

      {challengesFold.open && suggestion && (
        <ThemedView type="backgroundElement" style={styles.suggest}>
          <ThemedText style={styles.suggestIcon}>{suggestion.tier.icon}</ThemedText>
          <View style={styles.flex}>
            <ThemedText type="smallBold">
              Go for {suggestion.tier.name} · +
              {tierXp(suggestion.tier.days, habitCountOn(habits, today))} XP
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {suggestion.length} days of {iconText(suggestion.habit.emoji)} {suggestion.habit.name}
              , no misses.
            </ThemedText>
          </View>
          <Pressable
            onPress={() => startChallenge(suggestion.habit.id, suggestion.length)}
            style={[styles.suggestButton, { backgroundColor: theme.gold }]}>
            <ThemedText type="smallBold" themeColor="onGold">
              Start
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      <SectionHeading
        title={dayHabits.length === 1 ? 'Habit' : 'Habits'}
        accessory={
          <InfoButton
            title="Managing habits"
            text="Tap the ring to check in; long-press the ring to undo. Tap a habit to open its page. To edit or delete, long-press the habit itself, or open it and use the Edit and 🗑 buttons at the top. Deleting removes its history, but trophies you earned stay."
          />
        }
      />

      {/* Day navigator: log today or fix past days, never the future. */}
      <View style={styles.dayNav}>
        <Pressable
          accessibilityLabel="Previous day"
          onPress={() => move(-1)}
          hitSlop={10}
          style={[
            styles.arrow,
            { backgroundColor: theme.backgroundElement },
            day <= earliest && styles.arrowOff,
          ]}>
          <ThemedText style={styles.arrowText}>‹</ThemedText>
        </Pressable>
        <View style={styles.dayLabel}>
          {isToday ? (
            <>
              <ThemedText type="smallBold">
                {fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric' })}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.accent }}>
                Today
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText type="small" style={{ color: theme.gold, fontWeight: 700 }}>
                EDITING PAST DAY
              </ThemedText>
              <ThemedText type="smallBold">
                {fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric' })}
              </ThemedText>
            </>
          )}
        </View>
        <Pressable
          accessibilityLabel="Next day"
          onPress={() => move(1)}
          hitSlop={10}
          style={[
            styles.arrow,
            { backgroundColor: theme.backgroundElement },
            isToday && styles.arrowOff,
          ]}>
          <ThemedText style={styles.arrowText}>›</ThemedText>
        </Pressable>
      </View>
      {!isToday && (
        <Animated.View entering={FadeIn} style={styles.center}>
          <Pressable
            onPress={() => setOffset(0)}
            style={[styles.returnButton, { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" themeColor="onAccent">
              Return to today
            </ThemedText>
          </Pressable>
        </Animated.View>
      )}
      {prompt && (
        <Animated.View
          key={prompt.key}
          entering={FadeInDown}
          exiting={FadeOut}
          style={styles.center}>
          <ThemedView type="dangerSoft" style={styles.prompt}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              {prompt.text}
            </ThemedText>
          </ThemedView>
        </Animated.View>
      )}

      {/* Build / Break pager */}
      <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
        {(
          [
            {
              p: 0,
              label: 'Build',
              list: build,
              color: theme.accent,
              info: 'Habits you want to do more of. Tap the ring each time you do one. Finishing them keeps your streaks and challenges alive.',
            },
            {
              p: 1,
              label: 'Break',
              list: quit,
              color: theme.danger,
              info: 'Habits you want to quit. Each day you stay away from one, tap its ring to log a clean day. It turns from red to green.',
            },
          ] as const
        ).map(({ p, label, list, color, info }) => {
          const selected = page === p;
          const done = list.filter((h) => isDone(h, day)).length;
          return (
            <Pressable
              key={label}
              onPress={() => goToPage(p)}
              style={[styles.segment, selected && { backgroundColor: theme.background }]}>
              <View
                style={[styles.segmentDot, { backgroundColor: color, opacity: selected ? 1 : 0.4 }]}
              />
              <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
                {label}
              </ThemedText>
              {list.length > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {done}/{list.length}
                </ThemedText>
              )}
              <InfoButton
                title={label === 'Build' ? 'Build: good habits' : 'Break: bad habits'}
                text={info}
              />
            </Pressable>
          );
        })}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={heights[page] ? { height: heights[page] } : undefined}
            contentContainerStyle={styles.pagerContent}
            onMomentumScrollEnd={(e) => setPage(e.nativeEvent.contentOffset.x > width / 2 ? 1 : 0)}>
            {renderPage(build, 'build', 0)}
            {renderPage(quit, 'quit', 1)}
          </ScrollView>
        )}
      </View>

      {loaded && habits.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Tap a ring to check in · Long-press a habit to edit or delete
        </ThemedText>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  suggestIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  suggestButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowOff: {
    opacity: 0.35,
  },
  arrowText: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: 500,
  },
  dayLabel: {
    flex: 1,
    alignItems: 'center',
  },
  returnButton: {
    borderRadius: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginTop: -Spacing.one,
  },
  prompt: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + Spacing.half,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three - 3,
  },
  segmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pagerContent: {
    alignItems: 'flex-start',
  },
  page: {
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.one,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  sectionIcon: {
    fontSize: 20,
    lineHeight: 26,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
    width: 16,
    textAlign: 'center',
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  rows: {
    gap: Spacing.two,
  },
  addButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    alignItems: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  hint: {
    textAlign: 'center',
  },
});
