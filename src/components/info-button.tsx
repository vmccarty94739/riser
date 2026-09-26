import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const BUBBLE_WIDTH = 260;

/** A small ⓘ that opens an explanation bubble next to it. Tap anywhere to dismiss. */
export function InfoButton({
  title,
  text,
  color,
}: {
  title?: string;
  text: string;
  color?: string;
}) {
  const theme = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // The modal's own height (can differ from the window's on Android edge-to-edge).
  const [modalH, setModalH] = useState(screenH);
  const tint = color ?? theme.textSecondary;

  const open = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  };

  // Place the bubble under the icon (or above, near the bottom), clamped to the screen.
  const below = anchor ? anchor.y < screenH * 0.65 : true;
  const left = anchor
    ? Math.max(
        Spacing.three,
        Math.min(screenW - BUBBLE_WIDTH - Spacing.three, anchor.x + anchor.w / 2 - BUBBLE_WIDTH / 2)
      )
    : 0;
  const arrowLeft = anchor ? anchor.x + anchor.w / 2 - left - 7 : 0;

  return (
    <>
      <Pressable
        ref={ref}
        onPress={open}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={title ? `About ${title}` : 'More info'}
        style={[styles.icon, { borderColor: tint }]}>
        <ThemedText style={[styles.i, { color: tint }]}>i</ThemedText>
      </Pressable>
      {anchor && (
        <Modal
          statusBarTranslucent
          navigationBarTranslucent
          transparent
          visible
          animationType="none"
          onRequestClose={() => setAnchor(null)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            onPress={() => setAnchor(null)}
            onLayout={(e) => setModalH(e.nativeEvent.layout.height)}>
            <Animated.View
              entering={FadeIn.duration(120)}
              style={[StyleSheet.absoluteFill, styles.scrim]}
            />
            <Animated.View
              entering={ZoomIn.duration(160)}
              style={[
                styles.bubble,
                { left, backgroundColor: theme.text },
                below ? { top: anchor.y + anchor.h + 10 } : { bottom: modalH - anchor.y + 10 },
              ]}>
              <View
                style={[
                  styles.arrow,
                  { left: arrowLeft, backgroundColor: theme.text },
                  below ? { top: -6 } : { bottom: -6 },
                ]}
              />
              {title && (
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {title}
                </ThemedText>
              )}
              <ThemedText type="small" style={{ color: theme.background, opacity: 0.9 }}>
                {text}
              </ThemedText>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  i: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: 800,
    fontStyle: 'italic',
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  bubble: {
    position: 'absolute',
    width: BUBBLE_WIDTH,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  arrow: {
    position: 'absolute',
    width: 14,
    height: 14,
    transform: [{ rotate: '45deg' }],
  },
});
