import { type PropsWithChildren, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string; action?: ReactNode }>;

/** Scrollable tab screen with a large title, padded clear of the notch and tab bar. */
export function ScreenScroll({ title, subtitle, action, children }: Props) {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInset={insets}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, contentPlatformStyle]}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              {subtitle && (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.subtitle}>
                  {subtitle}
                </ThemedText>
              )}
              <ThemedText type="subtitle">{title}</ThemedText>
            </View>
            {action}
          </View>
          {children}
        </View>
      </ScrollView>
      {/* Content scrolls under the status bar; this strip keeps the clock and icons readable. */}
      <View style={[styles.statusBar, { height: insets.top, backgroundColor: theme.background }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  statusBar: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 0,
    left: 0,
    right: 0,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.one,
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    textTransform: 'uppercase',
  },
});
