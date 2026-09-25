import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HabitIcon } from '@/components/habit-icon';
import { ScreenScroll } from '@/components/screen-scroll';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { addDays, dayKey, fmtDay, useHabits, type Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { proofUri } from '@/lib/proofs';

const COLUMNS = 3;
const GAP = Spacing.one + 2;

type Photo = { habit: Habit; day: string; file: string };

/** Every proof photo, newest day first, grouped by date and labeled with its habit. */
export default function CameraRollScreen() {
  const theme = useTheme();
  const { habits } = useHabits();
  const [width, setWidth] = useState(0);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const today = dayKey();

  const photos: Photo[] = habits.flatMap((habit) =>
    Object.entries(habit.proofs).map(([day, file]) => ({ habit, day, file }))
  );
  const days = [...new Set(photos.map((p) => p.day))].sort().reverse();
  const size = width ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0;

  const label = (day: string) =>
    day === today
      ? 'Today'
      : day === addDays(today, -1)
        ? 'Yesterday'
        : fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <ScreenScroll
      title="Camera Roll"
      subtitle={
        photos.length
          ? `${photos.length} proof photo${photos.length === 1 ? '' : 's'}`
          : 'Your proof'
      }
      action={<SettingsButton />}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {!photos.length ? (
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText style={styles.emptyIcon}>📷</ThemedText>
            <ThemedText type="smallBold">No proof photos yet</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              When you check off a habit on your Dashboard, tap the camera on its row to snap a
              photo. It lands here, sorted by date.
            </ThemedText>
          </ThemedView>
        ) : (
          width > 0 &&
          days.map((day) => {
            const dayPhotos = photos.filter((p) => p.day === day);
            return (
              <View key={day} style={styles.section}>
                <View style={styles.dateRow}>
                  <ThemedText type="smallBold">{label(day)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {dayPhotos.length} photo{dayPhotos.length === 1 ? '' : 's'}
                  </ThemedText>
                </View>
                <View style={styles.grid}>
                  {dayPhotos.map((p) => (
                    <Pressable
                      key={`${p.habit.id}-${p.day}`}
                      onPress={() => setViewing(p)}
                      accessibilityLabel={`${p.habit.name}, ${label(p.day)}`}
                      style={[
                        styles.tile,
                        { width: size, height: size, backgroundColor: theme.backgroundElement },
                      ]}>
                      <Image
                        source={{ uri: proofUri(p.file) }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                      <View style={styles.caption}>
                        <HabitIcon icon={p.habit.emoji} size={14} />
                        <ThemedText numberOfLines={1} style={styles.captionText}>
                          {p.habit.name}
                        </ThemedText>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </ScreenScroll>
  );
}

function PhotoViewer({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { setProof } = useHabits();
  if (!photo) return null;

  const remove = () => {
    const run = () => {
      setProof(photo.habit.id, photo.day, null);
      onClose();
    };
    if (Platform.OS === 'web') return run();
    Alert.alert('Delete this photo?', 'The check-in stays; only the photo is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View
        style={[
          styles.viewer,
          { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.three },
        ]}>
        <View style={styles.viewerTop}>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText style={styles.viewerText}>Close</ThemedText>
          </Pressable>
          <Pressable onPress={remove} hitSlop={12}>
            <ThemedText style={[styles.viewerText, styles.viewerDelete]}>Delete</ThemedText>
          </Pressable>
        </View>
        <Animated.View entering={FadeIn} style={styles.viewerImageWrap}>
          <Image
            source={{ uri: proofUri(photo.file) }}
            style={styles.viewerImage}
            contentFit="contain"
          />
        </Animated.View>
        <View style={styles.viewerInfo}>
          <HabitIcon icon={photo.habit.emoji} size={28} quit={photo.habit.kind === 'quit'} />
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={styles.viewerText}>
              {photo.habit.name}
            </ThemedText>
            <ThemedText type="small" style={styles.viewerSub}>
              {fmtDay(photo.day, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => {
              onClose();
              router.push(`/habit/${photo.habit.id}`);
            }}
            style={styles.viewerButton}>
            <ThemedText type="small" style={styles.viewerText}>
              Open habit ›
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  emptyIcon: {
    fontSize: 40,
    lineHeight: 48,
  },
  section: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: Spacing.one,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    margin: 5,
    paddingVertical: 2,
    paddingLeft: 3,
    paddingRight: 6,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  captionText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 600,
    flexShrink: 1,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    paddingHorizontal: Spacing.three,
  },
  viewerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  viewerText: {
    color: '#ffffff',
  },
  viewerDelete: {
    color: '#ff8a8a',
  },
  viewerSub: {
    color: 'rgba(255,255,255,0.7)',
  },
  viewerImageWrap: {
    flex: 1,
  },
  viewerImage: {
    flex: 1,
  },
  viewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  viewerButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
