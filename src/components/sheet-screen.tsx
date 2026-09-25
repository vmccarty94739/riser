import { router } from 'expo-router';
import { type PropsWithChildren, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PropsWithChildren<{
  title: string;
  /** Optional button on the right, e.g. Save. */
  action?: ReactNode;
  closeLabel?: string;
}>;

/** Scrollable modal screen with a compact header and a close button. */
export function SheetScreen({ title, action, closeLabel = 'Close', children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // iOS page sheets sit below the status bar; Android/web modals are full screen.
  const top = Platform.OS === 'ios' ? Spacing.three : insets.top + Spacing.two;

  return (
    // iOS lifts content via the ScrollView's keyboard insets; on Android the avoiding view plus the
    // default "resize" keyboard mode keep inputs visible (Expo's recommended setup for SDK 54+).
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: top }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={styles.side}>
          <ThemedText themeColor="textSecondary">{closeLabel}</ThemedText>
        </Pressable>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
          {title}
        </ThemedText>
        <View style={[styles.side, styles.right]}>{action}</View>
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  side: {
    minWidth: 72,
  },
  right: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
});
