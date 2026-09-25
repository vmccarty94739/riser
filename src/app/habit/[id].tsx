import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChallengeCard } from '@/components/challenge-card';
import { Heatmap } from '@/components/charts';
import { HabitFields, Section } from '@/components/habit-fields';
import { HabitIcon } from '@/components/habit-icon';
import { SheetScreen } from '@/components/sheet-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  bestStreak,
  challengeStatus,
  currentChallenge,
  currentStreak,
  dayKey,
  daysDone,
  describeTarget,
  fmtDay,
  formatTime,
  progressOn,
  tierFor,
  TROPHY_TIERS,
  useHabits,
  type NewHabit,
} from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { iconText } from '@/lib/icons';
import { proofUri } from '@/lib/proofs';
import { habitCountOn, tierXp, wonXp } from '@/lib/xp';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <ThemedView type="backgroundElement" style={styles.tile}>
      <ThemedText type="subtitle" style={styles.tileValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

export default function HabitScreen() {
  const theme = useTheme();
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { habits, challenges, updateHabit, removeHabit, startChallenge, setProof } = useHabits();
  const habit = habits.find((h) => h.id === id);
  // Opened via "Edit habit" from the Dashboard: start straight in edit mode.
  const [draft, setDraft] = useState<NewHabit | null>(() => {
    const h = habits.find((x) => x.id === id);
    return edit && h
      ? {
          name: h.name,
          emoji: h.emoji,
          note: h.note,
          kind: h.kind,
          target: h.target,
          reminders: h.reminders,
        }
      : null;
  });
  const [viewing, setViewing] = useState<string | null>(null);

  if (!habit) {
    return (
      <SheetScreen title="Habit">
        <ThemedText themeColor="textSecondary">This habit no longer exists.</ThemedText>
      </SheetScreen>
    );
  }

  const quit = habit.kind === 'quit';
  const challenge = currentChallenge(challenges, habit.id);
  const showChallenge = challenge && challengeStatus(challenge, habit) !== 'won';
  const won = challenges.filter((c) => c.habitId === habit.id && c.completedAt);
  const bestWon = Math.max(0, ...won.filter((c) => !c.custom).map((c) => c.length));
  const month = daysDone(habit, 30);
  const photos = Object.entries(habit.proofs).sort(([a], [b]) => (a < b ? 1 : -1));

  const confirmDelete = () => {
    const remove = () => {
      router.back();
      removeHabit(habit.id);
    };
    if (Platform.OS === 'web') return remove();
    Alert.alert(
      'Delete habit?',
      `"${habit.name}" and its history will be removed. Trophies stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ]
    );
  };

  if (draft) {
    const valid = draft.name.trim().length > 0;
    const save = () => {
      if (!valid) return;
      updateHabit(habit.id, { ...draft, name: draft.name.trim(), note: draft.note.trim() });
      setDraft(null);
    };
    return (
      <SheetScreen
        title="Edit habit"
        action={
          <Pressable onPress={save} disabled={!valid} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent, opacity: valid ? 1 : 0.4 }}>
              Save
            </ThemedText>
          </Pressable>
        }>
        <HabitFields value={draft} onChange={setDraft} />
        <Pressable onPress={() => setDraft(null)} style={styles.link}>
          <ThemedText type="small" themeColor="textSecondary">
            Discard changes
          </ThemedText>
        </Pressable>
      </SheetScreen>
    );
  }

  return (
    <SheetScreen
      title=""
      action={
        <View style={styles.headerActions}>
          <Pressable
            hitSlop={8}
            onPress={() =>
              setDraft({
                name: habit.name,
                emoji: habit.emoji,
                note: habit.note,
                kind: habit.kind,
                target: habit.target,
                reminders: habit.reminders,
              })
            }>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Edit
            </ThemedText>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={confirmDelete}
            accessibilityLabel="Delete habit"
            style={[styles.trash, { backgroundColor: theme.dangerSoft }]}>
            <ThemedText style={styles.trashIcon}>🗑</ThemedText>
          </Pressable>
        </View>
      }>
      <View style={styles.hero}>
        <HabitIcon icon={habit.emoji} size={56} quit={quit} />
        <ThemedText type="subtitle" style={styles.center}>
          {habit.name}
        </ThemedText>
        {habit.note ? (
          <ThemedText themeColor="textSecondary" style={[styles.center, styles.note]}>
            “{habit.note}”
          </ThemedText>
        ) : null}
        <View style={styles.badges}>
          <ThemedView type={quit ? 'dangerSoft' : 'accentSoft'} style={styles.badge}>
            <ThemedText type="small" style={{ color: quit ? theme.danger : theme.accent }}>
              {quit ? 'Quitting' : 'Building'} · {describeTarget(habit)}
            </ThemedText>
          </ThemedView>
          {habit.reminders.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.badge}>
              <ThemedText type="small" themeColor="textSecondary">
                🔔 {habit.reminders.map(formatTime).join(' · ')}
              </ThemedText>
            </ThemedView>
          )}
        </View>
      </View>

      <View style={styles.tiles}>
        <Stat label={quit ? 'Clean streak' : 'Streak'} value={`🔥 ${currentStreak(habit)}`} />
        <Stat label="Best" value={bestStreak(habit)} />
        <Stat label="Last 30 days" value={`${month.done}/${month.possible}`} />
      </View>

      <Section label="CONSISTENCY">
        <ThemedView type="backgroundElement" style={styles.card}>
          <Heatmap
            habits={[habit]}
            caption={
              habit.target > 1 ? 'Share of daily goal hit' : quit ? 'Clean days' : 'Days done'
            }
            score={(d) => (d < habit.createdAt ? null : progressOn(habit, d))}
          />
        </ThemedView>
      </Section>

      <Section
        label={`THIS HABIT'S TROPHY LADDER${
          won.length
            ? ` · ${won.length} EARNED · ${won
                .reduce((sum, c) => sum + wonXp(c, habits), 0)
                .toLocaleString()} XP`
            : ''
        }`}>
        {showChallenge && <ChallengeCard challenge={challenge} habit={habit} />}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ladder}>
          {TROPHY_TIERS.map((tier) => {
            const earned = tier.days <= bestWon;
            const current = showChallenge && tierFor(challenge.length).days === tier.days;
            return (
              <Pressable
                key={tier.days}
                disabled={!!showChallenge}
                onPress={() => startChallenge(habit.id, tier.days)}
                style={[
                  styles.rung,
                  {
                    backgroundColor: earned ? theme.goldSoft : theme.backgroundElement,
                    borderColor: current ? theme.gold : 'transparent',
                  },
                ]}>
                <ThemedText style={[styles.rungIcon, !earned && !current && styles.dim]}>
                  {tier.icon}
                </ThemedText>
                <ThemedText type="small" numberOfLines={1} style={styles.rungName}>
                  {tier.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rungDays}>
                  {earned ? 'Earned' : current ? 'In progress' : `${tier.days} days`}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={[styles.rungDays, { color: theme.gold, fontWeight: 700 }]}>
                  +{tierXp(tier.days, habitCountOn(habits, dayKey()))} XP
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
        {!showChallenge && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Tap a trophy to start that challenge.
          </ThemedText>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/new-challenge', params: { habitId: habit.id } })}
          style={[styles.customButton, { borderColor: theme.gold }]}>
          <ThemedText type="small" style={{ color: theme.gold }}>
            + Create your own challenge
          </ThemedText>
        </Pressable>
      </Section>

      {!quit && (
        <Section label={`PROOF PHOTOS${photos.length ? ` · ${photos.length}` : ''}`}>
          {photos.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photos}>
              {photos.map(([day, file]) => (
                <Pressable key={day} onPress={() => setViewing(day)} style={styles.photoWrap}>
                  <Image source={{ uri: proofUri(file) }} style={styles.photo} contentFit="cover" />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.photoDate}>
                    {fmtDay(day, { month: 'short', day: 'numeric' })}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                📷 After you check this habit off, tap the camera on its tile to add a proof photo.
              </ThemedText>
            </ThemedView>
          )}
        </Section>
      )}

      <Pressable
        onPress={confirmDelete}
        style={[styles.deleteButton, { borderColor: theme.danger }]}>
        <ThemedText type="smallBold" style={{ color: theme.danger }}>
          🗑 Delete habit
        </ThemedText>
      </Pressable>

      <Modal
        statusBarTranslucent
        navigationBarTranslucent
        visible={!!viewing}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing && habit.proofs[viewing] && (
            <>
              <Image
                source={{ uri: proofUri(habit.proofs[viewing]) }}
                style={styles.viewerImage}
                contentFit="contain"
              />
              <ThemedText style={styles.viewerCaption}>
                {iconText(habit.emoji)} {habit.name} ·{' '}
                {fmtDay(viewing, { weekday: 'long', month: 'long', day: 'numeric' })}
              </ThemedText>
              <Pressable
                onPress={() => {
                  setProof(habit.id, viewing, null);
                  setViewing(null);
                }}
                style={styles.viewerDelete}>
                <ThemedText type="small" style={{ color: '#ff8a8a' }}>
                  Remove photo
                </ThemedText>
              </Pressable>
            </>
          )}
        </Pressable>
      </Modal>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  customButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Spacing.three,
    padding: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  note: {
    fontStyle: 'italic',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  badge: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one,
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
    fontSize: 24,
    lineHeight: 32,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  ladder: {
    gap: Spacing.two,
  },
  rung: {
    width: 88,
    alignItems: 'center',
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    paddingVertical: Spacing.two,
  },
  rungIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  dim: {
    opacity: 0.3,
  },
  rungName: {
    fontSize: 12,
    fontWeight: 700,
  },
  rungDays: {
    fontSize: 11,
  },
  photos: {
    gap: Spacing.two,
  },
  photoWrap: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: Spacing.three,
  },
  photoDate: {
    fontSize: 11,
  },
  link: {
    alignItems: 'center',
    padding: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  trash: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIcon: {
    fontSize: 15,
    lineHeight: 19,
  },
  deleteButton: {
    borderWidth: 1.5,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  viewerImage: {
    width: '100%',
    height: '70%',
  },
  viewerCaption: {
    color: '#fff',
    textAlign: 'center',
  },
  viewerDelete: {
    padding: Spacing.two,
  },
});
