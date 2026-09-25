import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateAccountForm, SignInForm } from '@/components/auth-forms';
import { emptyHabit, HabitFields } from '@/components/habit-fields';
import { HabitIcon } from '@/components/habit-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeField } from '@/components/time-picker';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCloud } from '@/hooks/use-cloud';
import { describeTarget, useHabits, type NewHabit } from '@/hooks/use-habits';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { iconText } from '@/lib/icons';
import { ensurePermission } from '@/lib/reminders';

/** Everyone starts with at least this many habits; gaps are filled from `STARTERS`. */
const MIN_HABITS = 4;

const preset = (
  name: string,
  emoji: string,
  target = 1,
  kind: NewHabit['kind'] = 'build'
): NewHabit => ({
  name,
  emoji,
  target,
  kind,
  note: '',
  reminders: [],
});

const PRESETS: NewHabit[] = [
  preset('Drink a glass of water', '💧', 4),
  preset('Read 10 pages', '📚'),
  preset('Go for a walk', '🚶'),
  preset('Meditate 5 minutes', '🧘'),
  preset('Do 20 push-ups', '💪', 3),
  preset('No phone in bed', '📵'),
  preset('No smoking', '🚬', 1, 'quit'),
  preset('No doomscrolling', '📱', 1, 'quit'),
];

/** Easy wins used to round a new user up to MIN_HABITS. */
const STARTERS: NewHabit[] = [
  preset('Drink a glass of water', '💧', 4),
  preset('Go for a walk', '🚶'),
  preset('Read 10 pages', '📚'),
  preset('Meditate 5 minutes', '🧘'),
  preset('Eat a vegetable', '🥦'),
  preset('Journal for 5 minutes', '✍️'),
  preset('Write 3 things you’re grateful for', '🙏'),
  preset('In bed by 11', '😴'),
];

const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

export default function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const { habits, addHabit, startChallenge, updateSettings, setOnboarded, settings } = useHabits();
  const cloud = useCloud();
  const hasAccount = !!cloud.user && !cloud.user.anonymous;
  // "I already have an account": the sign-in form replaces the steps until the account loads.
  const [signingIn, setSigningIn] = useState(false);
  const { feedback, confetti } = useRewards();
  const [step, setStep] = useState(0);

  // Step 1: any number of presets, existing habits and custom habits.
  const [picked, setPicked] = useState<NewHabit[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [draft, setDraft] = useState<NewHabit | null>(null);
  // Step 2: which pick gets the first challenge (`new:<name>` or `existing:<id>`).
  const [challengeKey, setChallengeKey] = useState<string | null>(null);
  // Step 5: notifications.
  const [morning, setMorning] = useState(settings.morning);
  const [evening, setEvening] = useState(settings.evening);

  const choices = [
    ...existing.flatMap((id) => {
      const h = habits.find((x) => x.id === id);
      return h ? [{ key: `existing:${id}`, habit: h as NewHabit }] : [];
    }),
    ...picked.map((h) => ({ key: `new:${h.name}`, habit: h })),
  ];
  const selectedCount = choices.length;
  const totalAfter = habits.length + picked.length;
  const fillCount = Math.max(0, MIN_HABITS - totalAfter);
  const challengeChoice = choices.find((c) => c.key === challengeKey) ?? choices[0];

  const togglePreset = (h: NewHabit) =>
    setPicked((list) =>
      list.some((p) => p.name === h.name) ? list.filter((p) => p.name !== h.name) : [...list, h]
    );
  const toggleExisting = (id: string) =>
    setExisting((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const goTo = (target: number) => {
    // The account step only applies when accounts are available and not already set up.
    const skipAccount = !cloud.configured || hasAccount;
    const s = target === 4 && skipAccount ? (step < 4 ? 5 : 3) : target;
    setStep(s);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  // Android's back button steps back through onboarding instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (signingIn) {
        setSigningIn(false);
        return true;
      }
      if (step === 0) return false;
      setStep((s) => (s === 5 && (!cloud.configured || hasAccount) ? 3 : s - 1));
      return true;
    });
    return () => sub.remove();
  }, [step, signingIn, cloud.configured, hasAccount]);

  const finish = async (reminders: boolean) => {
    const allowed = reminders ? await ensurePermission(true) : false;
    const ids: Record<string, string> = Object.fromEntries(
      existing.map((id) => [`existing:${id}`, id])
    );
    for (const h of picked) {
      ids[`new:${h.name}`] = addHabit({ ...h, name: h.name.trim(), note: h.note.trim() }).id;
    }
    // Round up to MIN_HABITS with starter habits the user doesn't already have.
    const taken = new Set([...habits.map((h) => h.name), ...picked.map((h) => h.name)]);
    shuffle(STARTERS.filter((s) => !taken.has(s.name)))
      .slice(0, fillCount)
      .forEach((s) => addHabit(s));
    const challengeId = challengeChoice ? ids[challengeChoice.key] : undefined;
    if (challengeId) startChallenge(challengeId, 3);
    updateSettings({ reminders: allowed, morning, evening });
    setOnboarded(true);
    setTimeout(() => {
      feedback('perfect');
      confetti();
    }, 350);
  };

  const steps = [
    // 0 — Welcome
    <View key="welcome" style={styles.centerStep}>
      <Animated.Text
        maxFontSizeMultiplier={1.2}
        entering={ZoomIn.springify().damping(10).delay(100)}
        style={styles.heroEmoji}>
        🌱
      </Animated.Text>
      <Animated.View entering={FadeInDown.delay(250)}>
        <ThemedText type="title" style={styles.center}>
          Small wins.{'\n'}Every day.
        </ThemedText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(400)} style={styles.bullets}>
        {[
          ['✓', 'Build good habits and quit bad ones'],
          ['🏆', 'Climb the challenge ladder and earn trophies'],
          ['🔔', 'Get a nudge right when it matters'],
        ].map(([icon, text]) => (
          <View key={text} style={styles.bullet}>
            <ThemedView type="accentSoft" style={styles.bulletIcon}>
              <ThemedText style={{ color: theme.accent }}>{icon}</ThemedText>
            </ThemedView>
            <ThemedText style={styles.flex}>{text}</ThemedText>
          </View>
        ))}
      </Animated.View>
    </View>,

    // 1 — Pick habits (any number)
    <View key="pick" style={styles.step}>
      <ThemedText type="subtitle">What do you want to work on?</ThemedText>
      <ThemedText themeColor="textSecondary">
        Pick as many as you like: good habits to build, bad ones to quit.
      </ThemedText>
      <ThemedView type={selectedCount ? 'accentSoft' : 'backgroundElement'} style={styles.counter}>
        <ThemedText
          type="smallBold"
          style={{ color: selectedCount ? theme.accent : theme.textSecondary }}>
          {selectedCount} selected
        </ThemedText>
        {selectedCount > 0 && fillCount > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            We’ll add {fillCount} starter habit{fillCount === 1 ? '' : 's'} so you begin with{' '}
            {MIN_HABITS}. Remove any later.
          </ThemedText>
        )}
      </ThemedView>

      {habits.length > 0 && (
        <>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            YOUR HABITS
          </ThemedText>
          <View style={styles.presets}>
            {habits.map((h) => (
              <PresetCard
                key={h.id}
                habit={h}
                selected={existing.includes(h.id)}
                onPress={() => toggleExisting(h.id)}
              />
            ))}
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            ADD NEW
          </ThemedText>
        </>
      )}
      <View style={styles.presets}>
        {[...PRESETS, ...picked.filter((p) => !PRESETS.some((x) => x.name === p.name))].map((p) => (
          <PresetCard
            key={p.name}
            habit={p}
            selected={picked.some((x) => x.name === p.name)}
            onPress={() => togglePreset(p)}
          />
        ))}
      </View>
      {draft ? (
        <Animated.View entering={FadeIn} style={styles.step}>
          <HabitFields value={draft} onChange={setDraft} autoFocus />
          <View style={styles.row}>
            <Pressable onPress={() => setDraft(null)} style={styles.secondary}>
              <ThemedText themeColor="textSecondary">Cancel</ThemedText>
            </Pressable>
            <Pressable
              disabled={!draft.name.trim()}
              onPress={() => {
                setPicked((list) => [
                  ...list.filter((p) => p.name !== draft.name.trim()),
                  { ...draft, name: draft.name.trim() },
                ]);
                setDraft(null);
                feedback('tick');
              }}
              style={[
                styles.addButton,
                { backgroundColor: theme.accent },
                !draft.name.trim() && styles.disabled,
              ]}>
              <ThemedText type="smallBold" themeColor="onAccent">
                Add to my list
              </ThemedText>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <Pressable
          onPress={() => setDraft(emptyHabit())}
          style={[styles.dashed, { borderColor: theme.accent }]}>
          <ThemedText style={{ color: theme.accent }}>+ Create your own</ThemedText>
        </Pressable>
      )}
    </View>,

    // 2 — The first challenge
    <View key="challenge" style={styles.centerStep}>
      <ThemedText type="smallBold" style={{ color: theme.gold }}>
        YOUR FIRST CHALLENGE
      </ThemedText>
      <ThemedText type="subtitle" style={styles.center}>
        🥉 Kickstart: 3 days, no misses
      </ThemedText>
      <View style={styles.pips}>
        {[1, 2, 3].map((d, i) => (
          <Animated.View
            key={d}
            entering={ZoomIn.springify().delay(200 + i * 180)}
            style={[styles.pip, { borderColor: theme.gold, backgroundColor: theme.goldSoft }]}>
            <ThemedText type="subtitle" style={{ color: theme.gold }}>
              {d}
            </ThemedText>
          </Animated.View>
        ))}
        <Animated.Text
          maxFontSizeMultiplier={1.2}
          entering={ZoomIn.springify().delay(800)}
          style={styles.trophy}>
          🥉
        </Animated.Text>
      </View>
      {choices.length > 1 && (
        <View style={styles.full}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Which habit do you want to start with?
          </ThemedText>
          <View style={styles.choiceList}>
            {choices.map((c) => {
              const selected = c.key === challengeChoice?.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setChallengeKey(c.key)}
                  style={[
                    styles.choice,
                    {
                      backgroundColor: selected ? theme.goldSoft : theme.backgroundElement,
                      borderColor: selected ? theme.gold : 'transparent',
                    },
                  ]}>
                  <HabitIcon icon={c.habit.emoji} size={22} quit={c.habit.kind === 'quit'} />
                  <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                    {c.habit.name}
                  </ThemedText>
                  {selected && (
                    <ThemedText style={{ color: theme.gold, fontWeight: 800 }}>✓</ThemedText>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {challengeChoice && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {challengeChoice.habit.kind === 'quit' ? 'Stay clean from' : 'Do'}{' '}
          {iconText(challengeChoice.habit.emoji)}{' '}
          <ThemedText type="smallBold">{challengeChoice.habit.name}</ThemedText>
          {challengeChoice.habit.target > 1 ? ` ${challengeChoice.habit.target} times` : ''} each
          day for 3 days. Finish and Kickstart is yours. Then 🥈 Week Warrior unlocks, and the
          ladder keeps going.
        </ThemedText>
      )}
    </View>,

    // 3 — How Riser works
    <View key="how" style={styles.step}>
      <ThemedText type="subtitle">How Riser works</ThemedText>
      <ThemedText themeColor="textSecondary">
        Three tabs at the bottom. Here’s the whole app in 30 seconds.
      </ThemedText>
      {[
        {
          icon: '☑️',
          title: 'Dashboard: check in',
          body: 'Tap the ring next to a habit to log it. Long-press the ring to undo. Swipe between Build (good habits) and Break (bad habits). Use the arrows by the date to fix past days.',
        },
        {
          icon: '📊',
          title: 'Progress Report: see how you’re doing',
          body: 'Your trophy cabinet, perfect-day streak, charts, a calendar of your consistency, a report card for every habit, and your full history, for good and bad habits.',
        },
        {
          icon: '📷',
          title: 'Camera Roll: your proof',
          body: 'After checking off a habit, tap the camera on it to snap a proof photo. Every photo is saved here by date.',
        },
        {
          icon: '🏆',
          title: 'Trophies, XP & levels',
          body: 'Every habit has its own trophy ladder, from Kickstart to Legend. Every check-in, perfect day and trophy earns XP; level up to unlock new app colors and chimes. Make your own challenges too.',
        },
        {
          icon: '🗑️',
          title: 'Editing or deleting a habit',
          body: 'Long-press any habit on the Dashboard for Edit and Delete, or tap it to open its page, where Edit and Delete sit at the top.',
        },
        {
          icon: '⚙️',
          title: 'Settings',
          body: 'The gear at the top of each tab: reminder times, light/dark mode, colors and sounds.',
        },
      ].map((f, i) => (
        <Animated.View key={f.title} entering={FadeInDown.delay(70 * i)} style={styles.feature}>
          <ThemedView type="accentSoft" style={styles.bulletIcon}>
            <ThemedText style={{ color: theme.accent }}>{f.icon}</ThemedText>
          </ThemedView>
          <View style={styles.flex}>
            <ThemedText type="smallBold">{f.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {f.body}
            </ThemedText>
          </View>
        </Animated.View>
      ))}
    </View>,

    // 4 — Create an account
    <View key="account" style={styles.step}>
      <ThemedText type="subtitle">Back up your progress</ThemedText>
      <ThemedText themeColor="textSecondary">
        Create an account so your habits, streaks and trophies are safe, and follow you to a new
        phone.
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.accountCard}>
        <CreateAccountForm
          submitLabel="Create account"
          onDone={() => {
            feedback('complete');
            goTo(5);
          }}
        />
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary">
        🔒 Your password is encrypted and never stored on this phone. Skip this and your habits are
        still backed up to a private guest account.
      </ThemedText>
    </View>,

    // 5 — Notifications
    <View key="remind" style={styles.centerStep}>
      <ThemedText type="subtitle" style={styles.center}>
        We’ll keep you on track
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        One nudge in the morning to set your intention, one in the evening if something’s still
        open. Nothing when you’re done.
      </ThemedText>
      <Animated.View entering={FadeInDown.springify().delay(200)} style={styles.full}>
        <ThemedView type="backgroundElement" style={styles.notif}>
          <ThemedView type="accentSoft" style={styles.notifIcon}>
            <ThemedText>🌱</ThemedText>
          </ThemedView>
          <View style={styles.flex}>
            <ThemedText type="smallBold">Day 1 of 3 🥉</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Today’s mission: {challengeChoice && iconText(challengeChoice.habit.emoji)}{' '}
              {challengeChoice?.habit.name}. Kickstart is waiting.
            </ThemedText>
          </View>
        </ThemedView>
      </Animated.View>
      <ThemedView type="backgroundElement" style={styles.timeCard}>
        <View style={styles.timeRow}>
          <ThemedText style={styles.flex}>Morning intention</ThemedText>
          <TimeField value={morning} title="Morning intention" onChange={setMorning} />
        </View>
        <View style={styles.timeRow}>
          <ThemedText style={styles.flex}>Evening nudge</ThemedText>
          <TimeField value={evening} title="Evening nudge" onChange={setEvening} />
        </View>
      </ThemedView>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        You can change these anytime in Settings.
      </ThemedText>
    </View>,
  ];

  const last = step === steps.length - 1;
  const cta = [
    'Get started',
    selectedCount ? `Continue with ${selectedCount}` : 'Pick at least one',
    'Accept the challenge ⚔️',
    'Got it',
    'Create account',
    'Turn on notifications',
  ][step];
  const canContinue = step === 1 ? selectedCount > 0 && !draft : true;

  const onPrimary = () => {
    if (last) return finish(true);
    feedback(step === 2 ? 'complete' : 'tick');
    goTo(step + 1);
  };

  return (
    // The footer button must stay above the keyboard (account step), so the whole screen avoids it.
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingTop: insets.top + Spacing.two },
      ]}>
      <View style={styles.topBar}>
        <Pressable
          disabled={step === 0 && !signingIn}
          onPress={() => (signingIn ? setSigningIn(false) : goTo(step - 1))}
          hitSlop={12}
          style={[styles.back, step === 0 && !signingIn && styles.hidden]}>
          <ThemedText themeColor="textSecondary">Back</ThemedText>
        </Pressable>
        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i <= step ? theme.accent : theme.backgroundSelected },
                i === step && styles.dotActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}>
        {signingIn ? (
          <Animated.View key="signin" entering={FadeInRight.duration(280)} style={styles.inner}>
            <SignInStep
              onEmptyAccount={() => {
                setSigningIn(false);
                goTo(1);
              }}
            />
          </Animated.View>
        ) : (
          <Animated.View key={step} entering={FadeInRight.duration(280)} style={styles.inner}>
            {steps[step]}
          </Animated.View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + Spacing.three },
          signingIn && styles.hidden,
        ]}>
        {step !== 4 && (
          <Pressable
            disabled={!canContinue}
            onPress={onPrimary}
            style={[
              styles.primary,
              { backgroundColor: step === 2 ? theme.gold : theme.accent },
              !canContinue && styles.disabled,
            ]}>
            <ThemedText
              type="smallBold"
              themeColor={step === 2 ? 'onGold' : 'onAccent'}
              style={styles.primaryText}>
              {Platform.OS === 'web' && last ? 'Let’s go' : cta}
            </ThemedText>
          </Pressable>
        )}
        {step === 0 && cloud.configured && !hasAccount && (
          <Pressable onPress={() => setSigningIn(true)} style={styles.secondary}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              I already have an account
            </ThemedText>
          </Pressable>
        )}
        {step === 4 && (
          <Pressable onPress={() => goTo(5)} style={styles.secondary}>
            <ThemedText type="small" themeColor="textSecondary">
              Skip for now
            </ThemedText>
          </Pressable>
        )}
        {last && Platform.OS !== 'web' && (
          <Pressable onPress={() => finish(false)} style={styles.secondary}>
            <ThemedText type="small" themeColor="textSecondary">
              Maybe later
            </ThemedText>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** Sign in from the welcome screen; onboarding closes itself once the account's habits load. */
function SignInStep({ onEmptyAccount }: { onEmptyAccount: () => void }) {
  const theme = useTheme();
  const cloud = useCloud();
  const [done, setDone] = useState(false);

  if (done && cloud.user && !cloud.user.anonymous)
    return (
      <View style={styles.centerStep}>
        <ThemedText style={styles.heroEmoji}>{cloud.status === 'synced' ? '🌱' : '☁️'}</ThemedText>
        <ThemedText type="subtitle" style={styles.center}>
          {cloud.status === 'synced' ? 'You’re signed in' : 'Loading your habits…'}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {cloud.status === 'offline'
            ? 'You’re signed in. Your habits will appear as soon as you’re back online.'
            : cloud.status === 'synced'
              ? 'Your account doesn’t have any habits yet. Let’s set some up.'
              : 'This only takes a moment.'}
        </ThemedText>
        {cloud.status === 'synced' && (
          <Pressable onPress={onEmptyAccount} style={styles.secondary}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Pick my habits
            </ThemedText>
          </Pressable>
        )}
      </View>
    );

  return (
    <View style={styles.step}>
      <ThemedText type="subtitle">Welcome back</ThemedText>
      <ThemedText themeColor="textSecondary">
        Sign in to pick up your habits, streaks and trophies where you left off.
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.accountCard}>
        <SignInForm onDone={() => setDone(true)} />
      </ThemedView>
    </View>
  );
}

function PresetCard({
  habit,
  selected,
  onPress,
}: {
  habit: NewHabit;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { feedback } = useRewards();
  return (
    <Pressable
      onPress={() => {
        feedback(selected ? 'undo' : 'tick');
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[
        styles.preset,
        {
          backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
          borderColor: selected ? theme.accent : 'transparent',
        },
      ]}>
      <View style={styles.presetTop}>
        <HabitIcon icon={habit.emoji} size={28} quit={habit.kind === 'quit'} />
        <View
          style={[
            styles.checkbox,
            { borderColor: selected ? theme.accent : theme.textSecondary },
            selected && { backgroundColor: theme.accent },
          ]}>
          {selected && (
            <ThemedText style={[styles.checkboxMark, { color: theme.onAccent }]}>✓</ThemedText>
          )}
        </View>
      </View>
      <ThemedText type="smallBold" numberOfLines={2}>
        {habit.name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {describeTarget(habit)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  back: {
    width: 60,
  },
  hidden: {
    opacity: 0,
  },
  dots: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one + Spacing.half,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  scroll: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
  },
  step: {
    gap: Spacing.three,
  },
  centerStep: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroEmoji: {
    fontSize: 88,
    lineHeight: 104,
  },
  center: {
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  full: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  counter: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: 2,
  },
  feature: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  timeCard: {
    alignSelf: 'stretch',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bullets: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bulletIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: Spacing.one,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  preset: {
    width: '48.5%',
    flexGrow: 1,
    borderRadius: Spacing.four,
    borderWidth: 2,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  presetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: 800,
  },
  dashed: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    alignItems: 'center',
  },
  addButton: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  pips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginVertical: Spacing.two,
  },
  pip: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophy: {
    fontSize: 44,
    lineHeight: 54,
  },
  choiceList: {
    gap: Spacing.two,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  notif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    alignItems: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  primary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  primaryText: {
    fontSize: 16,
  },
  disabled: {
    opacity: 0.4,
  },
  secondary: {
    padding: Spacing.three,
  },
});
