import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { HabitIcon } from '@/components/habit-icon';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { TimeField } from '@/components/time-picker';
import { useEnableReminders } from '@/hooks/use-enable-reminders';
import { minutesOf, NOTE_MAX, type HabitKind, type NewHabit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { BUILD_GROUPS, DEFAULT_BUILD_ICON, DEFAULT_QUIT_ICON, QUIT_GROUPS } from '@/lib/icons';

const sortTimes = (times: string[]) => [...times].sort((a, b) => minutesOf(a) - minutesOf(b));

/** A sensible next check-in time: 3 hours after the last one, else 9 AM. */
function nextTime(times: string[]) {
  if (!times.length) return '09:00';
  const last = minutesOf(sortTimes(times)[times.length - 1]);
  const next = Math.min(22 * 60, last + 180);
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

export const emptyHabit = (kind: HabitKind = 'build'): NewHabit => ({
  name: '',
  emoji: kind === 'quit' ? DEFAULT_QUIT_ICON : DEFAULT_BUILD_ICON,
  note: '',
  kind,
  target: 1,
  reminders: [],
});

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync();
};

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  compact,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.chip,
        compact && styles.chipCompact,
        { backgroundColor: selected ? theme.accent : theme.backgroundElement },
      ]}>
      <ThemedText type="small" themeColor={selected ? 'onAccent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Two-option segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.segmented}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segment, selected && { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

/** Kind, name, note, icon, frequency and check-in times for creating or editing a habit. */
export function HabitFields({
  value,
  onChange,
  autoFocus,
}: {
  value: NewHabit;
  onChange: (next: NewHabit) => void;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const enableReminders = useEnableReminders();
  const set = (patch: Partial<NewHabit>) => onChange({ ...value, ...patch });
  const quit = value.kind === 'quit';
  const volume = !quit && value.target > 1;

  const setKind = (kind: HabitKind) => {
    if (kind === value.kind) return;
    onChange({
      ...value,
      kind,
      emoji: kind === 'quit' ? DEFAULT_QUIT_ICON : DEFAULT_BUILD_ICON,
      target: 1,
      reminders: value.reminders.slice(0, 1),
    });
  };

  const setTime = (i: number, t: string) =>
    set({ reminders: sortTimes(value.reminders.map((r, j) => (j === i ? t : r))) });
  const removeTime = (i: number) => set({ reminders: value.reminders.filter((_, j) => j !== i) });
  // Asking for a reminder turns notifications on (and asks the phone's permission) right away.
  const addTime = () => {
    set({ reminders: sortTimes([...value.reminders, nextTime(value.reminders)]) });
    enableReminders();
  };

  return (
    <>
      <Segmented
        options={[
          { value: 'build', label: 'Build a habit' },
          { value: 'quit', label: 'Quit a habit' },
        ]}
        value={value.kind}
        onChange={setKind}
      />

      <Section label={quit ? 'WHAT ARE YOU QUITTING?' : 'HABIT'}>
        <TextField
          leading={<HabitIcon icon={value.emoji} size={24} />}
          autoFocus={autoFocus}
          value={value.name}
          onChangeText={(name) => set({ name })}
          placeholder={quit ? 'e.g. No smoking' : 'e.g. Drink a glass of water'}
          returnKeyType="done"
          maxLength={40}
        />
        <TextField
          value={value.note}
          onChangeText={(note) => set({ note: note.replace(/\n/g, ' ') })}
          placeholder={
            quit ? 'Your why (optional): e.g. for my kids' : 'Note (optional): e.g. before coffee'
          }
          maxLength={NOTE_MAX}
          multiline
          footer={
            <ThemedText type="small" themeColor="textSecondary" style={styles.counter}>
              {value.note.length}/{NOTE_MAX}
            </ThemedText>
          }
        />
      </Section>

      <Section label="ICON">
        {quit
          ? QUIT_GROUPS.map((group) => (
              <View key={group.key} style={styles.iconGroup}>
                <ThemedText type="small" themeColor="textSecondary">
                  {group.label}
                </ThemedText>
                <View style={styles.quitGrid}>
                  {group.icons.map((q) => {
                    const selected = q.icon === value.emoji;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: selected }}
                        key={q.icon}
                        onPress={() => {
                          tap();
                          set({ emoji: q.icon, name: value.name.trim() ? value.name : q.name });
                        }}
                        style={[
                          styles.quitIcon,
                          {
                            backgroundColor: selected ? theme.dangerSoft : theme.backgroundElement,
                            borderColor: selected ? theme.danger : 'transparent',
                          },
                        ]}>
                        <HabitIcon icon={q.icon} size={24} />
                        <ThemedText type="small" numberOfLines={2} style={styles.quitLabel}>
                          {q.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          : BUILD_GROUPS.map((group) => (
              <View key={group.key} style={styles.iconGroup}>
                <ThemedText type="small" themeColor="textSecondary">
                  {group.label}
                </ThemedText>
                <View style={styles.emojiRow}>
                  {group.icons.map((e) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: e === value.emoji }}
                      key={e}
                      onPress={() => {
                        tap();
                        set({ emoji: e });
                      }}
                      style={[
                        styles.emojiChoice,
                        e === value.emoji && { backgroundColor: theme.accentSoft },
                      ]}>
                      <ThemedText style={styles.emoji}>{e}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
      </Section>

      {!quit && (
        <Section label="HOW OFTEN">
          <View style={styles.typeRow}>
            <TypeCard
              title="Once a day"
              detail="Check it off and you’re done"
              icon="✓"
              selected={!volume}
              onPress={() => set({ target: 1, reminders: value.reminders.slice(0, 1) })}
            />
            <TypeCard
              title="Multiple times"
              detail="Log each rep toward a daily goal"
              icon="⟳"
              selected={volume}
              onPress={() => set({ target: Math.max(2, value.target) })}
            />
          </View>
          {volume && (
            <ThemedView type="backgroundElement" style={styles.stepper}>
              <ThemedText style={styles.stepperLabel}>Times per day</ThemedText>
              <StepButton
                label="−"
                disabled={value.target <= 2}
                onPress={() =>
                  set({
                    target: value.target - 1,
                    reminders: value.reminders.slice(0, value.target - 1),
                  })
                }
              />
              <ThemedText type="subtitle" style={styles.stepperValue}>
                {value.target}
              </ThemedText>
              <StepButton
                label="+"
                disabled={value.target >= 20}
                onPress={() => set({ target: value.target + 1 })}
              />
            </ThemedView>
          )}
        </Section>
      )}

      {volume ? (
        <Section label={`CHECK-IN TIMES · ${value.reminders.length}/${value.target}`}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            Optional. Pick when you plan to do each one and we’ll nudge you, or leave it open.
          </ThemedText>
          {value.reminders.map((t, i) => (
            <ThemedView key={`${i}-${t}`} type="backgroundElement" style={styles.timeRow}>
              <ThemedText style={styles.flex}>Check-in {i + 1}</ThemedText>
              <TimeField
                value={t}
                title={`Check-in ${i + 1}`}
                onChange={(next) => setTime(i, next)}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => removeTime(i)}
                hitSlop={10}
                accessibilityLabel="Remove time">
                <ThemedText themeColor="textSecondary" style={styles.remove}>
                  ✕
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))}
          {value.reminders.length < value.target && (
            <Pressable
              accessibilityRole="button"
              onPress={addTime}
              style={[styles.addTime, { borderColor: theme.accent }]}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                + Add a check-in time
              </ThemedText>
            </Pressable>
          )}
        </Section>
      ) : (
        <Section label={quit ? 'DAILY CHECK-IN' : 'REMINDER'}>
          <ThemedView type="backgroundElement" style={styles.timeRow}>
            <ThemedText style={styles.flex}>Remind me</ThemedText>
            {value.reminders[0] && (
              <TimeField
                value={value.reminders[0]}
                title={quit ? 'Check-in time' : 'Reminder'}
                onChange={(t) => set({ reminders: [t] })}
              />
            )}
            <Switch
              value={value.reminders.length > 0}
              onValueChange={(on) => {
                set({ reminders: on ? [quit ? '21:00' : '09:00'] : [] });
                if (on) enableReminders();
              }}
              trackColor={{ true: theme.accent }}
            />
          </ThemedView>
        </Section>
      )}
    </>
  );
}

function TypeCard({
  title,
  detail,
  icon,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.typeCard,
        {
          backgroundColor: selected ? theme.accentSoft : theme.backgroundElement,
          borderColor: selected ? theme.accent : 'transparent',
        },
      ]}>
      <ThemedText style={[styles.typeIcon, { color: theme.accent }]}>{icon}</ThemedText>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {detail}
      </ThemedText>
    </Pressable>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Increase' : 'Decrease'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[
        styles.stepButton,
        { backgroundColor: theme.background },
        disabled && styles.disabled,
      ]}>
      <ThemedText type="subtitle" style={{ color: theme.accent, lineHeight: 30 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  label: {
    paddingHorizontal: Spacing.one,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: Spacing.half + 1,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three - 2,
  },
  counter: {
    fontSize: 11,
  },
  iconGroup: {
    gap: Spacing.one,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  emojiChoice: {
    padding: Spacing.one,
    borderRadius: Spacing.two,
  },
  emoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  quitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  quitIcon: {
    // Four per row; the last row keeps the same width instead of stretching.
    flexBasis: '22%',
    flexGrow: 1,
    maxWidth: '24%',
    alignItems: 'center',
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  quitLabel: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typeCard: {
    flex: 1,
    borderRadius: Spacing.four,
    borderWidth: 2,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  typeIcon: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.four,
    padding: Spacing.two,
    paddingLeft: Spacing.three,
    gap: Spacing.two,
  },
  stepperLabel: {
    flex: 1,
  },
  stepperValue: {
    minWidth: 44,
    textAlign: 'center',
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
  flex: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  remove: {
    fontSize: 16,
  },
  addTime: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  chipCompact: {
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one + Spacing.half,
  },
});
