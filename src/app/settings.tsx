import { useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { AccountCard } from '@/components/account-card';
import { DevTools } from '@/components/dev-tools';
import { Section, Segmented } from '@/components/habit-fields';
import { CoachNameField } from '@/components/coach-name-field';
import { TimeField } from '@/components/time-picker';
import { SheetScreen } from '@/components/sheet-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { readableText, Spacing, THEME_SWATCHES } from '@/constants/theme';
import { useCloud } from '@/hooks/use-cloud';
import { COACH_ENGINE } from '@/lib/coach';
import { useHabits } from '@/hooks/use-habits';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRewards } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';
import { CHIMES } from '@/lib/xp';
import { ensurePermission, sendTestReminder } from '@/lib/reminders';

/** A daily reminder: on/off plus its time on the wheel picker. */
function TimeRow({
  title,
  detail,
  on,
  time,
  onToggle,
  onTime,
}: {
  title: string;
  detail: string;
  on: boolean;
  time: string;
  onToggle: (v: boolean) => void;
  onTime: (t: string) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.flex}>
        <ThemedText>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <TimeField value={time} title={title} onChange={onTime} disabled={!on} />
      <Switch value={on} onValueChange={onToggle} trackColor={{ true: theme.accent }} />
    </ThemedView>
  );
}

/** Pick which unlocked color drives one of the two main UI colors. */
function SwatchPicker({
  label,
  detail,
  value,
  level,
  onPick,
}: {
  label: string;
  detail: string;
  value: string;
  /** The user's account level; swatches unlock at their `unlockedBy` level. */
  level: number;
  onPick: (id: string) => void;
}) {
  const theme = useTheme();
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const current = THEME_SWATCHES.find((s) => s.id === value);
  return (
    <ThemedView type="backgroundElement" style={styles.swatchCard}>
      <View style={styles.swatchHeader}>
        <View style={styles.flex}>
          <ThemedText>{label}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        </View>
        <ThemedText
          type="smallBold"
          style={{ color: theme[label === 'Main color' ? 'accent' : 'gold'] }}>
          {current?.name}
        </ThemedText>
      </View>
      <View style={styles.swatches}>
        {THEME_SWATCHES.map((s) => {
          const open = s.unlockedBy <= level;
          const selected = s.id === value;
          return (
            <Pressable
              key={s.id}
              disabled={!open}
              onPress={() => onPick(s.id)}
              accessibilityLabel={open ? s.name : `${s.name}, locked`}
              style={[styles.swatchOuter, selected && { borderColor: s[mode] }]}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: open ? s[mode] : theme.backgroundSelected },
                ]}>
                {!open && <ThemedText style={styles.lockLevel}>Lv{s.unlockedBy}</ThemedText>}
                {selected && (
                  <ThemedText style={[styles.selectedMark, { color: readableText(s[mode]) }]}>
                    ✓
                  </ThemedText>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

function Row({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View style={styles.flex}>
        <ThemedText>{title}</ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </ThemedView>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { habits, challenges, settings, updateSettings, setOnboarded } = useHabits();
  const cloud = useCloud();
  const xp = useXp();
  const unlockedCount = THEME_SWATCHES.filter((s) => s.unlockedBy <= xp.level).length;
  const { feedback, playChime } = useRewards();
  const [testSent, setTestSent] = useState(false);
  const native = Platform.OS !== 'web';

  const denied = () =>
    Alert.alert(
      'Notifications are off',
      'Turn on notifications for this app in Settings to get check-ins.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );

  const toggleReminders = async (on: boolean) => {
    if (on && !(await ensurePermission(true))) return denied();
    setBlocked(false);
    updateSettings({ reminders: on });
  };

  // Reminders can be on in Riser but blocked in the phone's settings; say so instead of failing silently.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!native || !settings.reminders) return;
    const check = () =>
      ensurePermission(false)
        .then((ok) => setBlocked(!ok))
        .catch(() => {});
    check();
    // Re-check when returning from the phone's settings.
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => sub.remove();
  }, [native, settings.reminders]);

  const confirm = (title: string, message: string, action: string, run: () => void) => {
    if (!native) return run();
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: run },
    ]);
  };

  return (
    <SheetScreen title="Settings">
      <Section label="ACCOUNT">
        <AccountCard />
      </Section>

      {COACH_ENGINE === 'device' ? (
        <Section label="COACH">
          <Row
            title="Coach"
            detail="Fresh coaching each time you open the app, plus weekly and monthly reports, written on your phone. Nothing leaves your device."
            value={!settings.coachOff}
            onChange={(on) => updateSettings({ coachOff: !on })}
          />
          {!settings.coachOff && (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                What should your coach call you?
              </ThemedText>
              <CoachNameField />
            </>
          )}
        </Section>
      ) : (
        cloud.configured && (
          <Section label="AI COACH">
            <Row
              title="AI coach"
              detail="A daily nudge plus weekly and monthly reports. Sends your habit names and check-ins to Anthropic’s Claude."
              value={settings.coach}
              onChange={(coach) => updateSettings({ coach, coachAsked: true })}
            />
          </Section>
        )
      )}

      <Section label="CHECK-INS">
        <Row
          title="Daily reminders"
          detail={
            native
              ? 'A morning intention, a coach tip and an evening nudge'
              : 'Available in the mobile app'
          }
          value={settings.reminders}
          onChange={toggleReminders}
        />
        {settings.reminders && blocked && (
          <Pressable
            onPress={() => Linking.openSettings()}
            style={[styles.warning, { backgroundColor: theme.dangerSoft }]}>
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              Notifications are blocked for Riser
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.danger }}>
              Your reminders can’t arrive. Tap to open your phone’s settings and allow
              notifications.
            </ThemedText>
          </Pressable>
        )}
        {settings.reminders && (
          <>
            <TimeRow
              title="Morning intention"
              detail="Set up the day"
              on={settings.morningOn}
              time={settings.morning}
              onToggle={(morningOn) => updateSettings({ morningOn })}
              onTime={(morning) => updateSettings({ morning })}
            />
            <TimeRow
              title="Evening nudge"
              detail="Skipped when you’re all done"
              on={settings.eveningOn}
              time={settings.evening}
              onToggle={(eveningOn) => updateSettings({ eveningOn })}
              onTime={(evening) => updateSettings({ evening })}
            />
            {!settings.coachOff && (
              <TimeRow
                title="Coach tip"
                detail="A personal insight about your habits"
                on={settings.coachPushOn}
                time={settings.coachPush}
                onToggle={(coachPushOn) => updateSettings({ coachPushOn })}
                onTime={(coachPush) => updateSettings({ coachPush })}
              />
            )}
            <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
              Each habit can have its own reminder times too. Open a habit and tap Edit.
            </ThemedText>
            <Pressable
              onPress={async () => {
                if (await sendTestReminder(habits, challenges, settings)) setTestSent(true);
                else denied();
              }}
              style={[styles.button, { borderColor: theme.accent }]}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                {testSent ? 'Sent! It arrives in a few seconds' : 'Send me a test nudge'}
              </ThemedText>
            </Pressable>
          </>
        )}
      </Section>

      <Section label={`APPEARANCE · ${unlockedCount} OF ${THEME_SWATCHES.length} COLORS`}>
        <Segmented
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: '☀️ Light' },
            { value: 'dark', label: '🌙 Dark' },
          ]}
          value={settings.appearance}
          onChange={(appearance) => updateSettings({ appearance })}
        />
        <SwatchPicker
          label="Main color"
          detail="Buttons, rings, checks and tabs"
          value={settings.accent}
          level={xp.level}
          onPick={(accent) => updateSettings({ accent })}
        />
        <SwatchPicker
          label="Highlight color"
          detail="Streaks, challenges and trophies"
          value={settings.gold}
          level={xp.level}
          onPick={(gold) => updateSettings({ gold })}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
          You’re level {xp.level}. Every few levels unlock a new color (earn XP from check-ins,
          perfect days and trophies). Good and bad habits stay green and red, and chart colors never
          change.
        </ThemedText>
      </Section>

      <Section label="REWARDS">
        <Row
          title="Sounds"
          detail="Chimes when you check in (respects silent mode)"
          value={settings.sound}
          onChange={(sound) => {
            updateSettings({ sound });
            if (sound) setTimeout(() => feedback('complete'), 50);
          }}
        />
        <ThemedView
          type="backgroundElement"
          style={[styles.chimeCard, !settings.sound && styles.dimmed]}>
          <ThemedText>Check-in chime</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Plays when you complete a habit. Tap one to hear it and use it.
          </ThemedText>
          {CHIMES.map((c) => {
            const open = c.level <= xp.level;
            const selected = settings.chime === c.id;
            return (
              <Pressable
                key={c.id}
                disabled={!open}
                onPress={() => {
                  updateSettings({ chime: c.id });
                  playChime(c.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: !open }}
                style={[
                  styles.chimeRow,
                  { borderColor: selected ? theme.accent : theme.backgroundSelected },
                  selected && { backgroundColor: theme.accentSoft },
                ]}>
                <View
                  style={[
                    styles.radio,
                    { borderColor: selected ? theme.accent : theme.textSecondary },
                  ]}>
                  {selected && (
                    <View style={[styles.radioDot, { backgroundColor: theme.accent }]} />
                  )}
                </View>
                <ThemedText style={[styles.flex, !open && styles.dimmed]}>{c.name}</ThemedText>
                {open ? (
                  <Pressable
                    onPress={() => playChime(c.id)}
                    hitSlop={10}
                    accessibilityLabel={`Preview ${c.name}`}>
                    <ThemedText type="small" style={{ color: theme.accent }}>
                      ▶ Play
                    </ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    🔒 Level {c.level}
                  </ThemedText>
                )}
              </Pressable>
            );
          })}
        </ThemedView>
        {native && (
          <Row
            title="Haptics"
            value={settings.haptics}
            onChange={(haptics) => updateSettings({ haptics })}
          />
        )}
      </Section>

      {__DEV__ && <DevTools />}

      <Section label="APP">
        <Pressable
          onPress={() =>
            confirm('Replay onboarding?', 'Your habits and history are kept.', 'Replay', () =>
              setOnboarded(false)
            )
          }
          style={styles.linkRow}>
          <ThemedText>Replay onboarding</ThemedText>
        </Pressable>
        <Pressable
          onPress={() =>
            confirm(
              'Erase everything?',
              cloud.user
                ? 'All habits, history and trophies will be deleted from this phone and the cloud, along with your account.'
                : 'All habits, history and trophies will be deleted.',
              'Erase',
              () =>
                cloud
                  .deleteEverything()
                  .catch((e: Error) => Alert.alert('Couldn’t erase your data', e.message))
            )
          }
          style={styles.linkRow}>
          <ThemedText style={{ color: theme.danger }}>Erase all data</ThemedText>
        </Pressable>
      </Section>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  sub: {
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.one,
  },
  warning: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: 2,
  },
  swatchCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  swatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatchOuter: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 22,
    padding: 2,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockLevel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 700,
    opacity: 0.7,
  },
  chimeCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dimmed: {
    opacity: 0.5,
  },
  selectedMark: {
    fontWeight: 800,
    fontSize: 16,
    lineHeight: 20,
  },
  button: {
    borderWidth: 1.5,
    borderRadius: Spacing.four,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  linkRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
});
