import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * A section heading inside a page (Habits, Challenges, Trophy Cabinet…). Deliberately smaller
 * than the page's large title. `accessory` sits right after the text (e.g. an ⓘ); `trailing`
 * is pushed to the right edge; `detail` is a plain line underneath.
 */
export function SectionHeading({
  title,
  accessory,
  trailing,
  detail,
}: {
  title: string;
  accessory?: ReactNode;
  trailing?: ReactNode;
  detail?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <ThemedText type="subtitle" style={styles.title}>
          {title}
        </ThemedText>
        {accessory}
        <View style={styles.spacer} />
        {trailing}
      </View>
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
});
