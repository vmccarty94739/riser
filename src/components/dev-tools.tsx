/**
 * Everything developer-only lives in this module: the tools at the end of Settings, time travel,
 * demo data and the `?seed=demo` link. Settings and the root layout load it with
 * `__DEV__ ? require(...) : null`, which Metro folds away before collecting dependencies, so none
 * of it (code, strings or demo data) is in release bundles.
 */
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Section } from '@/components/habit-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  addDays,
  challengeDays,
  challengeStatus,
  dayKey,
  EMPTY_STORE,
  fmtDay,
  tierFor,
  TROPHY_TIERS,
  useHabits,
  useStoreAccess,
  type Challenge,
  type Habit,
  type Store,
} from '@/hooks/use-habits';
import { useRewards, type Feedback } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';
import { clockOffset } from '@/lib/clock';
import { iconText } from '@/lib/icons';
import { listScheduled, sendTestReminder } from '@/lib/reminders';

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** 60 days of believable history, including a quit habit and two habits sharing an icon. */
function demoHabits(): Habit[] {
  const today = dayKey();
  const start = addDays(today, -59);
  const make = (name: string, emoji: string, rate: number, extra: Partial<Habit> = {}): Habit => {
    const habit: Habit = {
      id: newId() + name.length,
      name,
      emoji,
      note: '',
      kind: 'build',
      createdAt: start,
      target: 1,
      reminders: [],
      log: {},
      proofs: {},
      ...extra,
    };
    for (let i = 1; i < 60; i++) {
      const day = addDays(start, i - 1);
      // Ramp up over time so the charts show a trend.
      if (Math.random() < rate * (0.6 + (0.4 * i) / 60)) habit.log[day] = habit.target;
      else if (habit.target > 1 && Math.random() < 0.6)
        habit.log[day] = Math.ceil(habit.target / 2);
    }
    return habit;
  };
  return [
    make('Drink a glass of water', '💧', 0.8, {
      target: 4,
      reminders: ['09:00', '12:00', '15:00', '18:00'],
    }),
    make('Read 10 pages', '📚', 0.7, { note: 'Currently: Atomic Habits' }),
    make('Read to the kids', '📚', 0.6),
    make('Go for a walk', '🚶', 0.65),
    make('Meditate 5 minutes', '🧘', 0.5),
    make('No nicotine', '🚬', 0.85, { kind: 'quit', note: 'For my lungs and my wallet' }),
    make('No doomscrolling', '📱', 0.55, { kind: 'quit' }),
  ];
}

/**
 * A lived-in account for screenshots and QA: two months of history, a perfect-day streak,
 * earned trophies, running challenges and today half done. Deterministic for the last 10 days.
 */
function demoStore(): Store {
  const today = dayKey();
  const habits = demoHabits();
  const [water, read, readKids, walk, meditate, nicotine, scroll] = habits;
  // Last 6 days all done (a perfect streak); today partly done.
  for (let i = 1; i <= 6; i++) habits.forEach((h) => (h.log[addDays(today, -i)] = h.target));
  water.log[today] = 2;
  read.log[today] = 1;
  walk.log[today] = 1;
  scroll.log[today] = 1;
  delete readKids.log[today];
  delete meditate.log[today];
  delete nicotine.log[today];
  for (let i = 7; i <= 23; i++) water.log[addDays(today, -i)] = water.target;
  for (let i = 7; i <= 10; i++) nicotine.log[addDays(today, -i)] = 1;
  const won = (h: Habit, length: number, endAgo: number): Challenge => ({
    id: newId() + length + h.name.length,
    habitId: h.id,
    habitName: h.name,
    habitEmoji: h.emoji,
    habitKind: h.kind,
    custom: false,
    title: null,
    length,
    startDate: addDays(today, -endAgo - length + 1),
    completedAt: addDays(today, -endAgo),
    dismissed: false,
  });
  const running = (h: Habit, length: number, startAgo: number): Challenge => ({
    ...won(h, length, 0),
    id: newId() + 'r' + length + h.name.length,
    startDate: addDays(today, -startAgo),
    completedAt: null,
  });
  return {
    ...EMPTY_STORE,
    onboarded: true,
    habits,
    challenges: [
      won(water, 3, 20),
      won(water, 7, 13),
      won(read, 3, 1),
      won(nicotine, 3, 8),
      running(water, 14, 6),
      running(read, 7, 0),
      running(nicotine, 7, 6),
    ],
  };
}

/** Time travel, challenge shortcuts, trophies, XP and demo data, all written straight to the store. */
function useDevActions() {
  const { setStore } = useStoreAccess();
  const [offset, setOffsetState] = useState(clockOffset);
  const update = (fn: (s: Store) => Store) => setStore(fn);
  return {
    offset,
    setOffset: (days: number) => {
      globalThis.__riserClockOffset = days;
      setOffsetState(days);
      // A new store object re-renders every screen, so "today" moves everywhere at once.
      update((s) => ({ ...s }));
    },
    /** Rewrites a challenge so `daysDone` days are complete and the next one is today. */
    setChallengeProgress: (challengeId: string, daysDone: number) =>
      update((s) => {
        const challenge = s.challenges.find((c) => c.id === challengeId);
        if (!challenge) return s;
        const startDate = addDays(dayKey(), -daysDone);
        return {
          ...s,
          challenges: s.challenges.map((c) => (c.id === challengeId ? { ...c, startDate } : c)),
          habits: s.habits.map((h) => {
            if (h.id !== challenge.habitId) return h;
            const log = { ...h.log };
            for (let i = 0; i < challenge.length; i++) {
              const day = addDays(startDate, i);
              if (i < daysDone) log[day] = h.target;
              else delete log[day];
            }
            return { ...h, createdAt: h.createdAt < startDate ? h.createdAt : startDate, log };
          }),
        };
      }),
    loadDemo: () => update((s) => ({ ...s, habits: [...s.habits, ...demoHabits()] })),
    /** Adds a completed challenge of this length (unlocks that tier's trophy and color). */
    grantTrophy: (length: number) =>
      update((s) => {
        const habit = s.habits[0];
        if (!habit) return s;
        const today = dayKey();
        const challenge: Challenge = {
          id: newId(),
          habitId: habit.id,
          habitName: habit.name,
          habitEmoji: habit.emoji,
          habitKind: habit.kind,
          custom: false,
          title: null,
          length,
          startDate: addDays(today, -length),
          completedAt: today,
          dismissed: false,
        };
        return { ...s, challenges: [...s.challenges, challenge] };
      }),
    /** Adds (or with a negative number, removes) bonus XP to test levels. */
    addXp: (amount: number) => update((s) => ({ ...s, bonusXp: Math.max(0, s.bonusXp + amount) })),
  };
}

/** Opening the app with `?seed=demo` in the URL loads the demo account (for store screenshots). */
export function DevDemoLink() {
  const { loaded } = useHabits();
  const { setStore } = useStoreAccess();
  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (loaded && url?.includes('seed=demo')) setStore(demoStore());
    // Only react to new URLs, not to the store changes the seed itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, url]);
  return null;
}

function Button({
  label,
  onPress,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'gold' | 'danger';
}) {
  const theme = useTheme();
  const color = tone === 'gold' ? theme.gold : tone === 'danger' ? theme.danger : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, { borderColor: color }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Card({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
      <View style={styles.buttons}>{children}</View>
    </ThemedView>
  );
}

/** Developer-only tools to exercise challenges, celebrations and notifications without waiting. */
export function DevTools() {
  const { habits, challenges, settings, startChallenge, bonusXp } = useHabits();
  const dev = useDevActions();
  const devOffset = dev.offset;
  const xp = useXp();
  const { feedback, preview, confetti } = useRewards();
  const [scheduled, setScheduled] = useState<{ title: string; when: Date }[] | null>(null);

  const live = challenges
    .filter((c) => !c.completedAt && !c.dismissed)
    .map((c) => ({ c, habit: habits.find((h) => h.id === c.habitId) }))
    .filter(({ c, habit }) => habit && challengeStatus(c, habit) !== 'won');

  return (
    <Section label="DEVELOPER · ONLY IN DEV BUILDS">
      <Card
        title={`Simulated date: ${fmtDay(dayKey(), { weekday: 'short', month: 'short', day: 'numeric' })}`}
        detail={
          devOffset
            ? `${devOffset > 0 ? '+' : ''}${devOffset} day${Math.abs(devOffset) === 1 ? '' : 's'} from the real date. Reminders are paused while time-traveling.`
            : 'Jump days to live through a challenge in seconds: check in, advance a day, repeat.'
        }>
        <Button label="− 1 day" onPress={() => dev.setOffset(devOffset - 1)} />
        <Button label="+ 1 day" onPress={() => dev.setOffset(devOffset + 1)} />
        {devOffset !== 0 && (
          <Button label="Back to real date" tone="danger" onPress={() => dev.setOffset(0)} />
        )}
      </Card>

      {live.length ? (
        live.map(({ c, habit }) => {
          const done = challengeDays(c, habit).filter((d) => d.state === 'done').length;
          const tier = tierFor(c.length);
          return (
            <Card
              key={c.id}
              title={`${tier.icon} ${tier.name} · ${iconText(habit!.emoji)} ${habit!.name}`}
              detail={`${done}/${c.length} days done. "Final day" leaves just today open, so your next tap on the tile triggers the real trophy moment.`}>
              <Button label="Reset to day 1" onPress={() => dev.setChallengeProgress(c.id, 0)} />
              <Button
                label="Jump to final day"
                tone="gold"
                onPress={() => dev.setChallengeProgress(c.id, c.length - 1)}
              />
              <Button
                label="Win now"
                tone="gold"
                onPress={() => dev.setChallengeProgress(c.id, c.length)}
              />
            </Card>
          );
        })
      ) : (
        <Card title="No active challenge" detail="Start one to test the flow.">
          {habits[0] ? (
            <Button
              label={`Start 3 days on ${iconText(habits[0].emoji)}`}
              onPress={() => startChallenge(habits[0].id, 3)}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Add a habit first.
            </ThemedText>
          )}
        </Card>
      )}

      <Card
        title="Preview celebrations"
        detail="Plays the real animation, sound and haptics without changing data.">
        {TROPHY_TIERS.map((t) => (
          <Button
            key={t.days}
            label={`${t.icon} ${t.days}d`}
            tone="gold"
            onPress={() => preview.trophy(t.days)}
          />
        ))}
        <Button label="✨ Perfect day" onPress={preview.perfect} />
        <Button label="🎉 Confetti" onPress={confetti} />
      </Card>

      <Card
        title="Trophies"
        detail="Grants a finished challenge on your first habit: its trophy and XP (no trophy celebration, but a level-up will still play).">
        {TROPHY_TIERS.map((t) => (
          <Button key={t.days} label={`+ ${t.icon}`} onPress={() => dev.grantTrophy(t.days)} />
        ))}
      </Card>

      <Card
        title={`XP & levels · Level ${xp.level} (${xp.total.toLocaleString()} XP)`}
        detail={`${xp.into}/${xp.needed} XP into this level. Adding XP past a level plays the real level-up and its unlocks.${
          bonusXp ? ` Test bonus in use: ${bonusXp} XP.` : ''
        }`}>
        <Button label="+50 XP" tone="gold" onPress={() => dev.addXp(50)} />
        <Button label="Next level" tone="gold" onPress={() => dev.addXp(xp.needed - xp.into)} />
        <Button label="Preview level-up" tone="gold" onPress={preview.levelUp} />
        {bonusXp > 0 && (
          <Button label="Remove test XP" tone="danger" onPress={() => dev.addXp(-bonusXp)} />
        )}
      </Card>

      <Card
        title="Sounds & haptics"
        detail={settings.sound ? undefined : 'Sounds are off in Rewards above.'}>
        {(['tick', 'complete', 'perfect', 'challenge'] as Feedback[]).map((k) => (
          <Button
            key={k}
            label={k === 'complete' ? 'chime' : k === 'challenge' ? 'fanfare' : k}
            onPress={() => feedback(k)}
          />
        ))}
      </Card>

      {Platform.OS !== 'web' && (
        <Card title="Notifications" detail="Test nudges show even while the app is open.">
          <Button
            label="Send test nudge"
            onPress={() => sendTestReminder(habits, challenges, settings)}
          />
          <Button
            label="Show scheduled"
            onPress={async () => setScheduled(await listScheduled())}
          />
          {scheduled && (
            <View style={styles.scheduled}>
              <ThemedText type="small" themeColor="textSecondary">
                {scheduled.length} scheduled{settings.reminders ? '' : ' (daily reminders are off)'}
              </ThemedText>
              {scheduled.slice(0, 6).map((n, i) => (
                <ThemedText key={i} type="small" numberOfLines={1}>
                  {n.when.toLocaleString(undefined, {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  · {n.title}
                </ThemedText>
              ))}
            </View>
          )}
        </Card>
      )}

      <Card
        title="Data"
        detail="Adds 7 habits with 60 days of history (including quit habits and a shared icon).">
        <Button label="Load demo history" onPress={dev.loadDemo} />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one + Spacing.half,
  },
  scheduled: {
    width: '100%',
    gap: 2,
    marginTop: Spacing.one,
  },
});
