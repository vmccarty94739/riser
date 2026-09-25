import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import {
  CelebrationLayer,
  type LevelUpMoment,
  type TrophyMoment,
} from '@/components/celebration-layer';
import {
  activeOn,
  addDays,
  challengeDays,
  challengeStatus,
  countOn,
  currentChallenge,
  dayKey,
  isDone,
  nextChallengeLength,
  useHabits,
  type Habit,
} from '@/hooks/use-habits';
import { useXp } from '@/hooks/use-xp';
import { challengeXp, habitCountOn, unlocksBetween } from '@/lib/xp';

export type Feedback = 'tick' | 'complete' | 'undo' | 'perfect' | 'challenge';

type RewardsValue = {
  /** Sound + haptics for a moment in the loop. */
  feedback: (kind: Feedback) => void;
  /** Log one check-in for `day` and reward it. Returns what happened. */
  checkIn: (habit: Habit, day: string) => Feedback | 'full';
  /** Remove one check-in for `day`. */
  undo: (habit: Habit, day: string) => void;
  /** Full-screen confetti. */
  confetti: () => void;
  /** Play a completion chime by id (Settings preview). */
  playChime: (id: string) => void;
  /** Developer previews: fire a celebration without changing any data. */
  preview: {
    trophy: (length: number) => void;
    perfect: () => void;
    levelUp: () => void;
  };
};

const RewardsContext = createContext<RewardsValue | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function playHaptics(kind: Feedback) {
  switch (kind) {
    case 'tick':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'undo':
      return Haptics.selectionAsync();
    case 'complete':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'perfect':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await wait(180);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await wait(120);
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    case 'challenge':
      for (const style of [
        Haptics.ImpactFeedbackStyle.Light,
        Haptics.ImpactFeedbackStyle.Medium,
        Haptics.ImpactFeedbackStyle.Heavy,
      ]) {
        await Haptics.impactAsync(style);
        await wait(130);
      }
      await wait(150);
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function RewardsProvider({ children }: PropsWithChildren) {
  const {
    habits,
    challenges,
    settings,
    loaded,
    onboarded,
    seenLevel,
    setSeenLevel,
    setCount,
    markChallengeWon,
    startChallenge,
  } = useHabits();
  const xp = useXp();
  const chimes: Record<string, ReturnType<typeof useAudioPlayer>> = {
    kalimba: useAudioPlayer(require('@/assets/sounds/chime-kalimba.wav')),
    marimba: useAudioPlayer(require('@/assets/sounds/chime-marimba.wav')),
    bell: useAudioPlayer(require('@/assets/sounds/chime-bell.wav')),
    bubble: useAudioPlayer(require('@/assets/sounds/chime-bubble.wav')),
    harp: useAudioPlayer(require('@/assets/sounds/chime-harp.wav')),
    crystal: useAudioPlayer(require('@/assets/sounds/chime-crystal.wav')),
  };
  const sounds = {
    tick: useAudioPlayer(require('@/assets/sounds/tick.wav')),
    complete: chimes[settings.chime] ?? chimes.kalimba,
    perfect: useAudioPlayer(require('@/assets/sounds/perfect.wav')),
    challenge: useAudioPlayer(require('@/assets/sounds/fanfare.wav')),
  };
  const [confettiKey, setConfettiKey] = useState(0);
  const [perfectKey, setPerfectKey] = useState(0);
  const [trophy, setTrophy] = useState<TrophyMoment | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpMoment | null>(null);
  const celebrated = useRef(new Set<string>());

  useEffect(() => {
    // Respect the silent switch and never stop the user's music.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(
      () => {}
    );
  }, []);

  const feedback = (kind: Feedback) => {
    if (settings.haptics && Platform.OS !== 'web') playHaptics(kind).catch(() => {});
    if (settings.sound && kind !== 'undo') {
      const player = sounds[kind];
      player.seekTo(0);
      player.play();
    }
  };

  // A challenge is won the moment its last day is hit, whether by a check-in or a backfill.
  // The next rung of the ladder starts tomorrow, so there's always a trophy in play.
  useEffect(() => {
    for (const c of challenges) {
      if (c.completedAt || c.dismissed) continue;
      const habit = habits.find((h) => h.id === c.habitId);
      if (challengeStatus(c, habit) !== 'won') continue;
      markChallengeWon(c.id);
      // Ladder challenges roll straight into the next rung; custom ones stand alone.
      const next = c.custom ? null : nextChallengeLength(c.length);
      if (next) startChallenge(c.habitId, next, { startDate: addDays(dayKey(), 1) });
      if (celebrated.current.has(c.id)) continue;
      celebrated.current.add(c.id);
      setTimeout(() => {
        feedback('challenge');
        setTrophy({
          challenge: c,
          nextLength: next,
          xp: challengeXp(c, habitCountOn(habits, dayKey())),
        });
      }, 450);
    }
  });

  // Level-ups: celebrate each new level once. The first measurement (e.g. an existing user on
  // upgrade) is recorded silently; dropping a level (undo) never re-triggers a celebration.
  useEffect(() => {
    if (!loaded || !onboarded) return;
    if (seenLevel === null) return setSeenLevel(xp.level);
    if (xp.level <= seenLevel) return;
    const from = seenLevel;
    const to = xp.level;
    setSeenLevel(to);
    // Not cleared on re-run: saving seenLevel re-runs this effect, and the celebration must survive it.
    setTimeout(() => setLevelUp({ from, to, unlocks: unlocksBetween(from, to) }), 700);
  }, [loaded, onboarded, seenLevel, xp.level, setSeenLevel]);

  const confetti = () => setConfettiKey((k) => k + 1);

  const checkIn: RewardsValue['checkIn'] = (habit, day) => {
    const before = countOn(habit, day);
    if (habit.target === 1 && before >= 1) {
      setCount(habit.id, day, 0);
      feedback('undo');
      return 'undo';
    }
    if (before >= habit.target) {
      feedback('undo');
      return 'full';
    }
    const after = before + 1;
    setCount(habit.id, day, after);
    if (after < habit.target) {
      feedback('tick');
      return 'tick';
    }

    const updated: Habit = { ...habit, log: { ...habit.log, [day]: after } };
    const challenge = currentChallenge(challenges, habit.id);
    const winsChallenge =
      challenge && challengeDays(challenge, updated).every((d) => d.state === 'done');
    const active = activeOn(habits, day);
    const perfect =
      day === dayKey() &&
      active.length > 1 &&
      active.every((h) => h.id === habit.id || isDone(h, day));

    if (winsChallenge) {
      // The fanfare is coming; keep this one short.
      feedback('tick');
      return 'complete';
    }
    if (perfect) {
      feedback('perfect');
      confetti();
      setPerfectKey((k) => k + 1);
      return 'perfect';
    }
    feedback('complete');
    return 'complete';
  };

  const value: RewardsValue = {
    feedback,
    checkIn,
    undo: (habit, day) => {
      const before = countOn(habit, day);
      if (!before) return;
      setCount(habit.id, day, before - 1);
      feedback('undo');
    },
    confetti,
    playChime: (id) => {
      const player = chimes[id];
      if (!player) return;
      player.seekTo(0);
      player.play();
    },
    preview: {
      trophy: (length) => {
        const habit = habits[0];
        feedback('challenge');
        setTrophy({
          preview: true,
          nextLength: nextChallengeLength(length),
          xp: challengeXp({ length, custom: false }, habitCountOn(habits, dayKey())),
          challenge: {
            id: 'preview',
            habitId: habit?.id ?? 'preview',
            habitName: habit?.name ?? 'Your habit',
            habitEmoji: habit?.emoji ?? '✅',
            habitKind: habit?.kind ?? 'build',
            custom: false,
            title: null,
            length,
            startDate: dayKey(),
            completedAt: dayKey(),
            dismissed: false,
          },
        });
      },
      perfect: () => {
        feedback('perfect');
        confetti();
        setPerfectKey((k) => k + 1);
      },
      levelUp: () =>
        setLevelUp({
          from: xp.level,
          to: xp.level + 1,
          unlocks: unlocksBetween(xp.level, xp.level + 1),
          preview: true,
        }),
    },
  };

  return (
    <RewardsContext value={value}>
      {children}
      <CelebrationLayer
        confettiKey={confettiKey}
        perfectKey={perfectKey}
        trophy={trophy}
        onCloseTrophy={() => setTrophy(null)}
        levelUp={levelUp}
        onCloseLevelUp={() => setLevelUp(null)}
        onLevelUpShown={() => feedback('perfect')}
        playChime={value.playChime}
      />
    </RewardsContext>
  );
}

export function useRewards() {
  const ctx = use(RewardsContext);
  if (!ctx) throw new Error('useRewards must be used inside <RewardsProvider>');
  return ctx;
}
