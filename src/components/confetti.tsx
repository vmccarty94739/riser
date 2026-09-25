import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export const CONFETTI_COLORS = ['#FFB020', '#FF5C7A', '#3D9BF5', '#35C28B', '#A974FF', '#FFD84D'];

type Particle = {
  vx: number;
  vy: number;
  spin: number;
  size: number;
  color: string;
  round: boolean;
};

type Props = {
  /** Burst origin relative to this component's parent. */
  x: number;
  y: number;
  count?: number;
  /** Initial speed in px/s. */
  power?: number;
  gravity?: number;
  duration?: number;
  /** 0 = straight up only, 1 = full circle. */
  spread?: number;
  onDone?: () => void;
};

function makeParticles(count: number, power: number, spread: number): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2 * Math.PI * spread;
    const speed = power * (0.45 + Math.random() * 0.55);
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 1440,
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      round: Math.random() < 0.35,
    };
  });
}

function Piece({
  p,
  progress,
  x,
  y,
  gravity,
  duration,
}: {
  p: Particle;
  progress: SharedValue<number>;
  x: number;
  y: number;
  gravity: number;
  duration: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = (progress.value * duration) / 1000;
    // Air drag flattens the arc so pieces flutter rather than drop.
    const drag = 1 - Math.min(0.6, t * 0.5);
    return {
      opacity: progress.value > 0.75 ? (1 - progress.value) * 4 : 1,
      transform: [
        { translateX: x + p.vx * t * drag },
        { translateY: y + p.vy * t * drag + 0.5 * gravity * t * t },
        { rotate: `${p.spin * t}deg` },
        { scaleY: p.round ? 1 : 0.55 + 0.45 * Math.cos(t * 12) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: p.size,
          height: p.round ? p.size : p.size * 1.6,
          borderRadius: p.round ? p.size / 2 : 2,
          backgroundColor: p.color,
          marginLeft: -p.size / 2,
          marginTop: -p.size / 2,
        },
        style,
      ]}
    />
  );
}

/** A one-shot confetti burst. Mount it (with a fresh `key`) to fire; it calls `onDone` when finished. */
export function Confetti({
  x,
  y,
  count = 60,
  power = 900,
  gravity = 1400,
  duration = 1800,
  spread = 0.35,
  onDone,
}: Props) {
  const [particles] = useState(() => makeParticles(count, power, spread));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(16, withTiming(1, { duration, easing: Easing.linear }));
    const timer = setTimeout(() => onDone?.(), duration + 50);
    return () => clearTimeout(timer);
  }, [duration, onDone, progress]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((p, i) => (
        <Piece
          key={i}
          p={p}
          progress={progress}
          x={x}
          y={y}
          gravity={gravity}
          duration={duration}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
