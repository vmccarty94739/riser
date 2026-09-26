import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Appearance, AppState } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useCoach } from '@/hooks/use-coach';
import { useCoachPushText, useCoachVisits } from '@/hooks/use-coach-visit';
import { dayKey, HabitsProvider, useHabits } from '@/hooks/use-habits';
import { CloudProvider, useCloud } from '@/hooks/use-cloud';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { RewardsProvider } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { COACH_ENGINE, coachMessage, subscribeCoach } from '@/lib/coach';
import { syncReminders } from '@/lib/reminders';

SplashScreen.preventAutoHideAsync();

// Development only (the `?seed=demo` link); left out of release bundles entirely.
const Dev: typeof import('@/components/dev-tools') | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would bundle it
    require('@/components/dev-tools')
  : null;

export default function RootLayout() {
  return (
    <HabitsProvider>
      <CloudProvider>
        <NavigationTheme>
          <RewardsProvider>
            <AppearanceSync />
            <RootStack />
            <ReminderSync />
            {Dev && <Dev.DevDemoLink />}
            <StatusBar style="auto" />
          </RewardsProvider>
        </NavigationTheme>
        <AnimatedSplashOverlay />
      </CloudProvider>
    </HabitsProvider>
  );
}

/** Navigation colors from the app theme, so screen transitions and modals never flash the wrong color. */
function NavigationTheme({ children }: { children: React.ReactNode }) {
  const dark = useColorScheme() === 'dark';
  const theme = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: theme.accent,
          background: theme.background,
          card: theme.background,
          text: theme.text,
          notification: theme.danger,
        },
      }}>
      {children}
    </ThemeProvider>
  );
}

function RootStack() {
  const { loaded, onboarded } = useHabits();
  if (!loaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="new-habit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="new-challenge" options={{ presentation: 'modal' }} />
        <Stack.Screen name="habit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
}

/** Applies the light/dark choice from Settings app-wide, including native UI and the root view. */
function AppearanceSync() {
  const { loaded, settings } = useHabits();
  const theme = useTheme();
  useEffect(() => {
    if (!loaded) return;
    Appearance.setColorScheme(
      settings.appearance === 'system' ? 'unspecified' : settings.appearance
    );
  }, [loaded, settings.appearance]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);
  return null;
}

/** Keeps the next week of notifications in step with the user's habits. */
function ReminderSync() {
  const { loaded, habits, challenges, settings } = useHabits();
  const cloud = useCloud();
  // Writes today's coach nudge even if Progress isn't opened, for the morning notification.
  useCoach('daily', dayKey());
  // Fresh coaching each time the app is opened (Dashboard card, Coach's Report "Today").
  useCoachVisits();
  // The phone's AI versions of the afternoon coach notifications (empty without the model).
  const pushText = useCoachPushText();
  const pushKey = Object.entries(pushText).join(',');
  const daily = useSyncExternalStore(subscribeCoach, () => coachMessage('daily', cloud.user?.id));
  const coachOn = COACH_ENGINE === 'device' ? !settings.coachOff : settings.coach;
  const coach =
    coachOn && daily ? { day: daily.period_start, title: daily.title, body: daily.body } : null;
  const coachKey = coach ? `${coach.day}|${coach.title}` : '';
  // Bumped when the app returns to the foreground, so "today" and streaks are re-evaluated.
  const [foregrounds, setForegrounds] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounds((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      syncReminders(habits, challenges, settings, coach, pushText).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // `coach` and `pushText` are rebuilt every render; their keys track the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, habits, challenges, settings, foregrounds, coachKey, pushKey]);

  return null;
}
