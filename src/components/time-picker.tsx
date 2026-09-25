import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatTime, minutesOf } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

const ITEM = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

function toParts(time: string) {
  const total = minutesOf(time);
  const h24 = Math.floor(total / 60);
  return { hour: ((h24 + 11) % 12) + 1, minute: total % 60, pm: h24 >= 12 };
}

function fromParts(hour: number, minute: number, pm: boolean) {
  const h24 = (hour % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** One snapping column, like an alarm clock wheel. */
function Wheel({
  items,
  index,
  onChange,
  width,
}: {
  items: string[];
  index: number;
  onChange: (i: number) => void;
  width: number;
}) {
  const ref = useRef<ScrollView>(null);
  const [active, setActive] = useState(index);
  const current = useRef(index);
  // Ignore scroll events from the initial positioning so opening the picker is still and silent.
  const ready = useRef(Platform.OS === 'ios');

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(
      0,
      Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM))
    );
    onChange(i);
  };

  return (
    <View style={{ width, height: ITEM * VISIBLE }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: index * ITEM }}
        onLayout={() => {
          // iOS honors contentOffset; other platforms need an explicit jump before interaction.
          if (Platform.OS !== 'ios') {
            ref.current?.scrollTo({ y: index * ITEM, animated: false });
            requestAnimationFrame(() => (ready.current = true));
          }
        }}
        onScrollBeginDrag={() => (ready.current = true)}
        contentContainerStyle={{ paddingVertical: ITEM * Math.floor(VISIBLE / 2) }}
        onScroll={(e) => {
          const i = Math.max(
            0,
            Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM))
          );
          if (ready.current && i !== current.current) {
            current.current = i;
            setActive(i);
            if (Platform.OS !== 'web') Haptics.selectionAsync();
          }
        }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity?.y) settle(e);
        }}>
        {items.map((label, i) => {
          const distance = Math.abs(i - active);
          return (
            <Pressable
              key={label}
              onPress={() => {
                ref.current?.scrollTo({ y: i * ITEM, animated: true });
                onChange(i);
              }}
              style={styles.item}>
              <ThemedText
                style={[
                  styles.itemText,
                  { opacity: distance === 0 ? 1 : distance === 1 ? 0.45 : 0.2 },
                  distance === 0 && styles.itemActive,
                ]}>
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Bottom sheet with hour / minute / AM-PM wheels. */
export function TimePickerSheet({
  visible,
  value,
  title,
  onCancel,
  onDone,
}: {
  visible: boolean;
  value: string;
  title: string;
  onCancel: () => void;
  onDone: (time: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const initial = toParts(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [pm, setPm] = useState(initial.pm);

  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View entering={SlideInDown.duration(240).easing(Easing.out(Easing.cubic))}>
          <Pressable>
            <ThemedView
              type="background"
              style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
              <View style={styles.header}>
                <Pressable onPress={onCancel} hitSlop={10}>
                  <ThemedText themeColor="textSecondary">Cancel</ThemedText>
                </Pressable>
                <ThemedText type="smallBold">{title}</ThemedText>
                <Pressable onPress={() => onDone(fromParts(hour, minute, pm))} hitSlop={10}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Done
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.wheels}>
                <View style={[styles.band, { backgroundColor: theme.backgroundElement }]} />
                <Wheel items={HOURS} index={hour - 1} onChange={(i) => setHour(i + 1)} width={72} />
                <ThemedText style={styles.colon}>:</ThemedText>
                <Wheel items={MINUTES} index={minute} onChange={setMinute} width={72} />
                <Wheel
                  items={PERIODS}
                  index={pm ? 1 : 0}
                  onChange={(i) => setPm(i === 1)}
                  width={72}
                />
              </View>
            </ThemedView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** A tappable time value that opens the wheel picker. */
export function TimeField({
  value,
  onChange,
  title = 'Set time',
  disabled,
}: {
  value: string;
  onChange: (time: string) => void;
  title?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: theme.accentSoft }, disabled && styles.disabled]}>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          {formatTime(value)}
        </ThemedText>
      </Pressable>
      {open && (
        <TimePickerSheet
          visible
          value={value}
          title={title}
          onCancel={() => setOpen(false)}
          onDone={(t) => {
            setOpen(false);
            onChange(t);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
  },
  wheels: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  band: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    top: ITEM * Math.floor(VISIBLE / 2),
    height: ITEM,
    borderRadius: Spacing.three,
  },
  colon: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
    marginHorizontal: -Spacing.one,
  },
  item: {
    height: ITEM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ['tabular-nums'],
  },
  itemActive: {
    fontWeight: 700,
  },
  field: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.4,
  },
});
