import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Appearance, AppState } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { HabitsProvider, useHabits } from '@/hooks/use-habits';
import { CloudProvider, useCloud } from '@/hooks/use-cloud';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { RewardsProvider } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { coachMessage, subscribeCoach } from '@/lib/coach';
import { syncReminders } from '@/lib/reminders';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <HabitsProvider>
      <CloudProvider>
        <NavigationTheme>
          <RewardsProvider>
            <AppearanceSync />
            <RootStack />
            <ReminderSync />
            {__DEV__ && <DevDemoLink />}
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

/**
 * Development only: opening the app with `?seed=demo` in the URL loads the demo account
 * (used for store screenshots). Compiled out of release builds.
 */
function DevDemoLink() {
  const { loaded, dev } = useHabits();
  const url = Linking.useLinkingURL();
  const seed = dev.seedDemo;
  useEffect(() => {
    if (loaded && url?.includes('seed=demo')) seed();
    // Only react to new URLs, not to the store changes the seed itself causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, url]);
  return null;
}

/** Keeps the next week of notifications in step with the user's habits. */
function ReminderSync() {
  const { loaded, habits, challenges, settings } = useHabits();
  const cloud = useCloud();
  const daily = useSyncExternalStore(subscribeCoach, () => coachMessage('daily', cloud.user?.id));
  const coach =
    settings.coach && daily
      ? { day: daily.period_start, title: daily.title, body: daily.body }
      : null;
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
      syncReminders(habits, challenges, settings, coach).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
    // `coach` is rebuilt every render; `coachKey` tracks its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, habits, challenges, settings, foregrounds, coachKey]);

  return null;
}
