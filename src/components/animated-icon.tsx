import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BrandColor } from '@/constants/theme';

const DURATION = 550;

/** Matches the native splash screen exactly, then fades and lifts away once the app is ready. */
export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const exit = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    30: { opacity: 1, transform: [{ scale: 1.04 }], easing: Easing.out(Easing.quad) },
    100: { opacity: 0, transform: [{ scale: 1.12 }], easing: Easing.in(Easing.quad) },
  });

  const logo = <Image style={styles.logo} source={require('@/assets/images/splash-icon.png')} />;

  return animate ? (
    <Animated.View
      pointerEvents="none"
      entering={exit.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.overlay}>
      {logo}
    </Animated.View>
  ) : (
    <View
      pointerEvents="none"
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setAnimate(true));
      }}
      style={styles.overlay}>
      {logo}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BrandColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    width: 120,
    height: 120,
  },
});
