import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { emptyHabit, HabitFields } from '@/components/habit-fields';
import { SheetScreen } from '@/components/sheet-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useEnableReminders } from '@/hooks/use-enable-reminders';
import { useHabits } from '@/hooks/use-habits';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';

export default function NewHabitScreen() {
  const theme = useTheme();
  const { addHabit, startChallenge } = useHabits();
  const enableReminders = useEnableReminders();
  const { feedback, confetti } = useRewards();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [habit, setHabit] = useState(() => emptyHabit(params.kind === 'quit' ? 'quit' : 'build'));
  const [challenge, setChallenge] = useState(true);
  const quit = habit.kind === 'quit';
  const valid = habit.name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    const created = addHabit({ ...habit, name: habit.name.trim(), note: habit.note.trim() });
    if (habit.reminders.length) enableReminders();
    if (challenge) startChallenge(created.id, 3);
    router.back();
    // Creating a habit is a win too.
    setTimeout(() => {
      feedback('complete');
      confetti();
    }, 250);
  };

  return (
    <SheetScreen
      title={quit ? 'Habit to quit' : 'New habit'}
      closeLabel="Cancel"
      action={
        <Pressable accessibilityRole="button" onPress={save} disabled={!valid} hitSlop={12}>
          <ThemedText type="smallBold" style={{ color: theme.accent, opacity: valid ? 1 : 0.4 }}>
            Add
          </ThemedText>
        </Pressable>
      }>
      <HabitFields value={habit} onChange={setHabit} autoFocus={!quit} />

      <ThemedView type="goldSoft" style={styles.challenge}>
        <ThemedText style={styles.icon}>⚔️</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Start the 🥉 Kickstart challenge</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {quit ? 'Stay clean 3 days in a row' : 'Hit it 3 days in a row'} to earn your first
            trophy. Then the next one unlocks.
          </ThemedText>
        </View>
        <Switch value={challenge} onValueChange={setChallenge} trackColor={{ true: theme.gold }} />
      </ThemedView>

      <Pressable
        accessibilityRole="button"
        onPress={save}
        disabled={!valid}
        style={[
          styles.primary,
          { backgroundColor: quit ? theme.danger : theme.accent },
          !valid && styles.disabled,
        ]}>
        <ThemedText type="smallBold" themeColor="onAccent">
          {quit ? 'Start quitting' : 'Add habit'}
        </ThemedText>
      </Pressable>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  challenge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  icon: {
    fontSize: 24,
    lineHeight: 30,
  },
  flex: {
    flex: 1,
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
