import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The gear in each tab's header that opens Settings. */
export function SettingsButton() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      hitSlop={12}
      style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView
        name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
        tintColor={theme.accent}
        size={20}
        fallback={<ThemedText style={{ color: theme.accent }}>⚙︎</ThemedText>}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
});
