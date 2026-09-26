import { Alert, Linking, Platform } from 'react-native';

import { useHabits } from '@/hooks/use-habits';
import { ensurePermission } from '@/lib/reminders';

/**
 * Turns Timber's notifications on, asking the phone for permission if needed. Used the moment a
 * habit gets a reminder time, so setting a time can never silently do nothing because the main
 * "Daily reminders" switch happened to be off. If the phone blocks notifications, says how to fix
 * it. Returns whether reminders can now arrive.
 */
export function useEnableReminders() {
  const { settings, updateSettings } = useHabits();
  return async () => {
    if (Platform.OS === 'web') return false;
    const allowed = await ensurePermission(true);
    if (!allowed) {
      Alert.alert(
        'Notifications are blocked',
        'Your reminder is saved, but your phone won’t let Timber show it. Allow notifications for Timber in your phone’s Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }
    if (!settings.reminders) updateSettings({ reminders: true });
    return true;
  };
}
