import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

/**
 * A section heading inside a page (Habits, Challenges, Trophy Cabinet…). Deliberately smaller
 * than the page's large title. `accessory` sits right after the text (e.g. an ⓘ); `trailing`
 * is pushed to the right edge; `detail` is a plain line underneath. With `onToggle`, the heading
 * folds its section open and shut, with the same round arrow as the History days.
 */
export function SectionHeading({
  title,
  accessory,
  trailing,
  detail,
  open,
  onToggle,
}: {
  title: string;
  accessory?: ReactNode;
  trailing?: ReactNode;
  detail?: string;
  open?: boolean;
  onToggle?: () => void;
}) {
  const theme = useTheme();
  const row = (
    <>
      <ThemedText type="subtitle" style={styles.title}>
        {title}
      </ThemedText>
      {accessory}
      <View style={styles.spacer} />
      {trailing}
      {onToggle && (
        <View style={[styles.chevronWrap, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText
            themeColor="textSecondary"
            style={[styles.chevron, open && styles.chevronOpen]}>
            ›
          </ThemedText>
        </View>
      )}
    </>
  );
  return (
    <View style={styles.wrap}>
      {onToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: !!open }}
          style={styles.row}>
          {row}
        </Pressable>
      ) : (
        <View style={styles.row}>{row}</View>
      )}
      {detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.two,
    marginBottom: -Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  spacer: {
    flex: 1,
  },
  chevronWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: 600,
    transform: [{ rotate: '90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '-90deg' }],
  },
});

/** Open/shut state for a foldable section, remembered in settings (open by default). */
export function useFold(key: string) {
  const { settings, toggleCollapsed } = useHabits();
  return { open: !settings.collapsed.includes(key), onToggle: () => toggleCollapsed(key) };
}
