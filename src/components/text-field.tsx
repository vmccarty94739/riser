import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  /** The field sits on a card (so it uses the page color), rather than on the page. */
  onCard?: boolean;
  /** Shown inside the box before the text, e.g. the habit's icon. */
  leading?: React.ReactNode;
  /** Shown inside the box after the text, e.g. a Show/Hide button. */
  trailing?: React.ReactNode;
  /** Shown under the text inside the box, e.g. a character counter. */
  footer?: React.ReactNode;
};

/** The app's one text-box style: every text input uses this so they all look the same. */
export function TextField({
  onCard,
  leading,
  trailing,
  footer,
  multiline,
  style,
  ...props
}: TextFieldProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: onCard ? theme.background : theme.backgroundElement },
      ]}>
      <View style={styles.row}>
        {leading && <View style={styles.leading}>{leading}</View>}
        <TextInput
          maxFontSizeMultiplier={1.4}
          placeholderTextColor={theme.textSecondary}
          multiline={multiline}
          style={[styles.input, multiline && styles.multiline, { color: theme.text }, style]}
          {...props}
        />
        {trailing && <View style={styles.trailing}>{trailing}</View>}
      </View>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    paddingLeft: Spacing.three,
  },
  trailing: {
    paddingRight: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  multiline: {
    minHeight: 72,
    paddingTop: Spacing.two + 4,
    textAlignVertical: 'top',
  },
  footer: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    marginTop: -Spacing.one,
  },
});
