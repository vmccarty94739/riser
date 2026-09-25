import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip, Section, Segmented } from '@/components/habit-fields';
import { HabitIcon } from '@/components/habit-icon';
import { SheetScreen } from '@/components/sheet-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  addDays,
  challengeStatus,
  currentChallenge,
  dayKey,
  tierFor,
  trophyOf,
  useHabits,
} from '@/hooks/use-habits';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { challengeXp, habitCountOn } from '@/lib/xp';

const LENGTHS = [3, 5, 7, 10, 14, 21, 30, 45, 60, 90];

/** Build-your-own challenge: any habit, any length, your own trophy name. */
export default function NewChallengeScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ habitId?: string }>();
  const { habits, challenges, startChallenge } = useHabits();
  const { feedback } = useRewards();
  const [habitId, setHabitId] = useState(params.habitId ?? habits[0]?.id ?? '');
  const [length, setLength] = useState(10);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<'today' | 'tomorrow'>('today');
  const habit = habits.find((h) => h.id === habitId);
  const tier = tierFor(length);
  const name = title.trim() || `${length}-Day Challenge`;
  const existing = habit ? currentChallenge(challenges, habit.id) : undefined;
  const replacing = existing && challengeStatus(existing, habit) === 'active';

  const create = () => {
    if (!habit) return;
    startChallenge(habit.id, length, {
      title: name,
      startDate: start === 'today' ? dayKey() : addDays(dayKey(), 1),
    });
    feedback('complete');
    router.back();
  };

  return (
    <SheetScreen
      title="Custom challenge"
      closeLabel="Cancel"
      action={
        <Pressable onPress={create} disabled={!habit} hitSlop={12}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Start
          </ThemedText>
        </Pressable>
      }>
      <ThemedView type="goldSoft" style={[styles.preview, { borderColor: theme.gold }]}>
        <ThemedText style={styles.previewIcon}>{tier.icon}</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            YOUR TROPHY
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={2}>
            {name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {length} days in a row{habit ? ` of ${habit.name}` : ''}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.gold, fontWeight: 700 }}>
            +{challengeXp({ length, custom: true }, habitCountOn(habits, dayKey()))} XP when you
            finish
          </ThemedText>
        </View>
      </ThemedView>

      <Section label="CHALLENGE NAME">
        <ThemedView type="backgroundElement" style={styles.inputBox}>
          <TextInput
            maxFontSizeMultiplier={1.4}
            value={title}
            onChangeText={setTitle}
            maxLength={32}
            placeholder={`e.g. Sober September · ${length}-Day Challenge`}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
          />
        </ThemedView>
      </Section>

      <Section label="HABIT">
        <View style={styles.habits}>
          {habits.map((h) => {
            const selected = h.id === habitId;
            return (
              <Pressable
                key={h.id}
                onPress={() => setHabitId(h.id)}
                style={[
                  styles.habit,
                  {
                    backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
                    borderColor: selected ? theme.accent : 'transparent',
                  },
                ]}>
                <HabitIcon icon={h.emoji} size={22} quit={h.kind === 'quit'} />
                <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                  {h.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        {replacing && existing && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            This replaces the {trophyOf(existing).name} challenge running on this habit.
          </ThemedText>
        )}
      </Section>

      <Section label="LENGTH">
        <View style={styles.chips}>
          {LENGTHS.map((l) => (
            <Chip
              key={l}
              compact
              label={`${l} days`}
              selected={length === l}
              onPress={() => setLength(l)}
            />
          ))}
        </View>
        <ThemedView type="backgroundElement" style={styles.stepper}>
          <ThemedText style={styles.flex}>Or set exactly</ThemedText>
          <Pressable
            onPress={() => setLength((l) => Math.max(2, l - 1))}
            style={[styles.stepButton, { backgroundColor: theme.background }]}>
            <ThemedText style={[styles.stepText, { color: theme.accent }]}>−</ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={styles.stepValue}>
            {length}
          </ThemedText>
          <Pressable
            onPress={() => setLength((l) => Math.min(365, l + 1))}
            style={[styles.stepButton, { backgroundColor: theme.background }]}>
            <ThemedText style={[styles.stepText, { color: theme.accent }]}>+</ThemedText>
          </Pressable>
        </ThemedView>
      </Section>

      <Section label="STARTS">
        <Segmented
          options={[
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
          ]}
          value={start}
          onChange={setStart}
        />
      </Section>

      <Pressable
        onPress={create}
        disabled={!habit}
        style={[styles.primary, { backgroundColor: theme.gold }, !habit && styles.disabled]}>
        <ThemedText type="smallBold" themeColor="onGold">
          Start {name}
        </ThemedText>
      </Pressable>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1.5,
    padding: Spacing.three,
  },
  previewIcon: {
    fontSize: 40,
    lineHeight: 48,
  },
  inputBox: {
    borderRadius: Spacing.four,
  },
  input: {
    fontSize: 16,
    padding: Spacing.three,
  },
  habits: {
    gap: Spacing.two,
  },
  habit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.four,
    padding: Spacing.two,
    paddingLeft: Spacing.three,
    gap: Spacing.two,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 600,
  },
  stepValue: {
    minWidth: 52,
    textAlign: 'center',
  },
  primary: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
  },
  disabled: {
    opacity: 0.4,
  },
});
