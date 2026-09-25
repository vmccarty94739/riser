import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { VAPE_ICON } from '@/lib/icons';

/** A slim vape pen with a puff of vapor. */
function VapeIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={16.5} cy={5} r={2.4} fill="#CBD5E1" />
      <Circle cx={19.6} cy={3.6} r={1.7} fill="#E2E8F0" />
      <Circle cx={14.4} cy={3.2} r={1.5} fill="#E2E8F0" />
      <Rect x={9.6} y={3.5} width={3.2} height={3.5} rx={1.2} fill="#1F2937" />
      <Rect x={8.4} y={6.6} width={5.6} height={15.4} rx={2.2} fill="#64748B" />
      <Rect x={9.3} y={7.6} width={1.3} height={13} rx={0.6} fill="#94A3B8" />
      <Rect x={9.6} y={16.2} width={3.2} height={1.8} rx={0.9} fill="#38BDF8" />
    </Svg>
  );
}

/**
 * Renders a habit icon (emoji or custom-drawn). Quit habits get a prohibition slash so
 * "🚬" reads as "no smoking", never as "smoked".
 */
export function HabitIcon({ icon, size, quit }: { icon: string; size: number; quit?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size * 1.15,
        height: size * 1.15,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {icon === VAPE_ICON ? (
        <VapeIcon size={size} />
      ) : (
        // The icon box has a fixed size, so the emoji must not grow with the text-size setting.
        <Text
          allowFontScaling={false}
          accessible={false}
          style={{ fontSize: size * 0.92, lineHeight: size * 1.1 }}>
          {icon}
        </Text>
      )}
      {quit && (
        <Svg
          width={size * 1.15}
          height={size * 1.15}
          viewBox="0 0 24 24"
          style={StyleSheet.absoluteFill}>
          <Circle
            cx={12}
            cy={12}
            r={10.6}
            stroke={theme.danger}
            strokeWidth={1.8}
            fill="none"
            opacity={0.9}
          />
          <Line
            x1={4.6}
            y1={4.6}
            x2={19.4}
            y2={19.4}
            stroke={theme.danger}
            strokeWidth={1.8}
            opacity={0.9}
          />
        </Svg>
      )}
    </View>
  );
}
