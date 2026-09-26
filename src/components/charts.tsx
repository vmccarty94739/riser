import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ChartColors, readableText, Spacing } from '@/constants/theme';
import {
  addDays,
  categoryGroups,
  chartBuckets,
  dayKey,
  dayScore,
  parseDay,
  tally,
  type Habit,
  type HabitKind,
} from '@/hooks/use-habits';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { iconText } from '@/lib/icons';

function useChartColors() {
  return ChartColors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

/** Blends two hex colors; t = 0 gives `a`, t = 1 gives `b`. */
function mixHex(a: string, b: string, t: number) {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ca, cb] = [parse(a), parse(b)];
  return `#${ca
    .map((c, i) =>
      Math.round(c + (cb[i] - c) * t)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** Relative luminance, to pick readable text on a filled cell. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The calendar's 6-step ramp, from white (nothing done) to the user's main color (everything).
 * Dark mode starts from the dark surface instead of white so empty days don't glare.
 */
function useHeatRamp() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const base = dark ? '#2E3135' : '#FFFFFF';
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => mixHex(base, theme.accent, t));
}

const CHART_HEIGHT = 160;
const SEGMENT_GAP = 2;
/** Unmet share of a segment: the same hue, muted. */
const MUTED = 0.28;

/**
 * Stacked bars: one bar per day (7), week (30) or month (90). Each bar is split into one segment
 * per habit category, sized by how many check-ins were possible; the solid part is what was met.
 * Tapping a bar or a category pill opens one detail panel (only one at a time).
 */
export function SegmentedBars({
  habits,
  kind,
  range,
}: {
  habits: Habit[];
  kind: HabitKind;
  range: 7 | 30 | 90;
}) {
  const theme = useTheme();
  const colors = useChartColors();
  const [detail, setDetail] = useState<{ bar: number } | { category: string } | null>(null);

  const buckets = chartBuckets(range);
  const allDays = buckets.flatMap((b) => b.days);
  const groups = categoryGroups(habits, kind).filter((g) => tally(g.habits, allDays).possible > 0);
  const kindHabits = groups.flatMap((g) => g.habits);
  const bars = buckets.map((b) => ({
    bucket: b,
    segments: groups.map((g) => ({ group: g, ...tally(g.habits, b.days) })),
  }));
  const max = Math.max(1, ...bars.map((b) => b.segments.reduce((sum, x) => sum + x.possible, 0)));
  const scale = (n: number) => (n / max) * CHART_HEIGHT;
  const rangeTotal = tally(kindHabits, allDays);
  const unit = range === 7 ? 'day' : range === 30 ? 'week' : 'month';
  const noun = kind === 'quit' ? 'clean days' : 'check-ins';

  const selectedBar = detail && 'bar' in detail ? detail.bar : null;
  const selectedCategory = detail && 'category' in detail ? detail.category : null;
  const toggle = (next: { bar: number } | { category: string }) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    const same =
      ('bar' in next && selectedBar === next.bar) ||
      ('category' in next && selectedCategory === next.category);
    setDetail(same ? null : next);
  };

  if (!groups.length) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Nothing to chart yet for this range.
      </ThemedText>
    );
  }

  // The one open panel: a bar's breakdown by category, or a category's habits.
  let panel: {
    title: string;
    subtitle: string;
    color?: string;
    rows: { key: string; label: string; color?: string; met: number; possible: number }[];
  } | null = null;
  if (selectedBar !== null) {
    const bar = bars[selectedBar];
    const t = tally(kindHabits, bar.bucket.days);
    panel = {
      title: bar.bucket.detail,
      subtitle: `${t.met} of ${t.possible} ${noun}`,
      rows: bar.segments
        .filter((x) => x.possible > 0)
        .map((x) => ({
          key: x.group.key,
          label: x.group.label,
          color: colors.series[x.group.slot],
          met: x.met,
          possible: x.possible,
        })),
    };
  } else if (selectedCategory) {
    const g = groups.find((x) => x.key === selectedCategory);
    if (g) {
      const t = tally(g.habits, allDays);
      panel = {
        title: g.label,
        subtitle: `${t.met} of ${t.possible} ${noun} · last ${range} days`,
        color: colors.series[g.slot],
        rows: g.habits.map((h) => ({
          key: h.id,
          label: `${iconText(h.emoji)}  ${h.name}`,
          ...tally([h], allDays),
        })),
      };
    }
  }

  return (
    <View style={styles.chart}>
      <View style={styles.readout}>
        <ThemedText type="smallBold">
          {rangeTotal.met} of {rangeTotal.possible} {noun}
          {kind === 'build' ? ' met' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Last {range} days · tap a {unit} or a category for details
        </ThemedText>
      </View>

      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          {[max, Math.round(max / 2), 0].map((v, i) => (
            <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.yTick}>
              {v}
            </ThemedText>
          ))}
        </View>
        <View style={styles.plot}>
          {[1, 0.5].map((g) => (
            <View
              key={g}
              style={[
                styles.grid,
                { bottom: g * CHART_HEIGHT, borderColor: theme.backgroundSelected },
              ]}
            />
          ))}
          <View
            style={[styles.grid, { bottom: 0, borderColor: theme.textSecondary, opacity: 0.5 }]}
          />
          <View style={styles.bars}>
            {bars.map((bar, i) => (
              <Pressable
                accessibilityRole="button"
                key={bar.bucket.key}
                onPress={() => toggle({ bar: i })}
                accessibilityLabel={`${bar.bucket.detail}: details`}
                style={styles.barHit}>
                <View
                  style={[
                    styles.stack,
                    {
                      maxWidth: range === 7 ? 30 : 44,
                      opacity: selectedBar === null || selectedBar === i ? 1 : 0.35,
                    },
                  ]}>
                  {bar.segments
                    .filter((x) => x.possible > 0)
                    .map((x, j) => {
                      const color = colors.series[x.group.slot];
                      const height = Math.max(3, scale(x.possible) - (j ? SEGMENT_GAP : 0));
                      const share = x.met / x.possible;
                      const dimmed = selectedCategory !== null && selectedCategory !== x.group.key;
                      return (
                        <View
                          key={x.group.key}
                          style={[
                            styles.segment,
                            {
                              height,
                              marginBottom: j ? SEGMENT_GAP : 0,
                              opacity: dimmed ? 0.2 : 1,
                            },
                          ]}>
                          <View
                            style={[
                              styles.fillPart,
                              { flex: 1 - share, backgroundColor: color, opacity: MUTED },
                            ]}
                          />
                          <View
                            style={[styles.fillPart, { flex: share, backgroundColor: color }]}
                          />
                        </View>
                      );
                    })
                    .reverse()}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.ticks}>
        <View style={styles.yAxisSpacer} />
        {bars.map((bar, i) => (
          <ThemedText
            key={bar.bucket.key}
            type="small"
            numberOfLines={1}
            style={[
              styles.tick,
              {
                color: selectedBar === i ? theme.text : theme.textSecondary,
                fontWeight: selectedBar === i ? 700 : 500,
              },
            ]}>
            {bar.bucket.tick}
          </ThemedText>
        ))}
      </View>

      <View style={[styles.legend, { borderColor: theme.backgroundSelected }]}>
        <View style={styles.keyRow}>
          <View style={styles.keySample}>
            <View style={[styles.keyBox, { backgroundColor: theme.textSecondary }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {kind === 'quit' ? 'Clean' : 'Met'}
            </ThemedText>
          </View>
          <View style={styles.keySample}>
            <View
              style={[styles.keyBox, { backgroundColor: theme.textSecondary, opacity: MUTED }]}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {kind === 'quit' ? 'Not logged clean' : 'Missed'}
            </ThemedText>
          </View>
        </View>
        <View style={styles.pills}>
          {groups.map((g) => {
            const color = colors.series[g.slot];
            const t = tally(g.habits, allDays);
            const selected = selectedCategory === g.key;
            const onColor = readableText(color);
            return (
              <Pressable
                key={g.key}
                onPress={() => toggle({ category: g.key })}
                accessibilityRole="button"
                accessibilityState={{ expanded: selected }}
                style={[
                  styles.pill,
                  { backgroundColor: selected ? color : `${color}22`, borderColor: color },
                ]}>
                <View style={[styles.pillDot, { backgroundColor: selected ? onColor : color }]} />
                <ThemedText
                  type="smallBold"
                  style={[styles.pillLabel, selected && { color: onColor }]}>
                  {g.label}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={[styles.pillCount, { color: selected ? onColor : theme.textSecondary }]}>
                  {t.met}/{t.possible}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {panel && (
        <Animated.View
          key={selectedBar !== null ? `bar-${selectedBar}` : `cat-${selectedCategory}`}
          entering={FadeIn.duration(180)}
          style={[
            styles.panel,
            {
              backgroundColor: theme.background,
              borderColor: panel.color ?? theme.backgroundSelected,
            },
          ]}>
          <View style={styles.panelHeader}>
            {panel.color && <View style={[styles.panelDot, { backgroundColor: panel.color }]} />}
            <View style={styles.flex}>
              <ThemedText type="smallBold">{panel.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {panel.subtitle}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDetail(null)}
              hitSlop={10}
              accessibilityLabel="Close details">
              <ThemedText themeColor="textSecondary" style={styles.panelClose}>
                ✕
              </ThemedText>
            </Pressable>
          </View>
          {panel.rows.map((r) => {
            const share = r.possible ? r.met / r.possible : 0;
            const barColor = r.color ?? panel!.color ?? theme.accent;
            return (
              <View key={r.key} style={styles.panelRow}>
                <View style={styles.panelRowTop}>
                  {r.color && <View style={[styles.swatch, { backgroundColor: r.color }]} />}
                  <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                    {r.label}
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.panelCount}>
                    {r.met}
                    <ThemedText type="small" themeColor="textSecondary">
                      /{r.possible}
                    </ThemedText>
                  </ThemedText>
                </View>
                <View style={[styles.panelTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[
                      styles.panelFill,
                      { width: `${share * 100}%`, backgroundColor: barColor },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

const WEEKS = 16;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Bin a 0–1 score into the heat ramp (index 0 = nothing done). */
function heatStep(score: number) {
  if (score <= 0) return 0;
  if (score >= 1) return 5;
  return Math.min(4, Math.ceil(score * 4));
}

/**
 * The last 16 weeks as real month calendars (Monday first), two per row. Each date is shaded
 * by its score; days outside the window are left blank.
 */
export function Heatmap({
  habits,
  score,
  caption = 'Share of habits done each day',
}: {
  habits: Habit[];
  /** Override the per-day 0–1 score (e.g. for a single habit). */
  score?: (day: string) => number | null;
  caption?: string;
}) {
  const theme = useTheme();
  const heat = useHeatRamp();
  const [width, setWidth] = useState(0);
  const today = dayKey();
  const windowStart = addDays(today, -(WEEKS * 7 - 1));
  const getScore = score ?? ((d: string) => dayScore(habits, d));

  // Months from the window's start month through this month.
  const months: { year: number; month: number }[] = [];
  const cursor = parseDay(windowStart);
  cursor.setDate(1);
  while (dayKey(cursor) <= today) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const gap = Spacing.three;
  const monthWidth = width ? (width - gap) / 2 : 0;
  const cell = monthWidth / 7;

  return (
    <View
      style={styles.heatmap}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <ThemedText type="small" themeColor="textSecondary">
        {caption}
      </ThemedText>
      {width > 0 && (
        <View style={[styles.months, { gap }]}>
          {months.map(({ year, month }) => {
            const first = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const lead = (first.getDay() + 6) % 7;
            const cells = [
              ...Array.from({ length: lead }, () => null),
              ...Array.from({ length: daysInMonth }, (_, i) =>
                dayKey(new Date(year, month, i + 1))
              ),
            ];
            return (
              <View
                key={`${year}-${month}`}
                style={[
                  styles.month,
                  { width: monthWidth, borderColor: theme.backgroundSelected },
                ]}>
                <ThemedText type="smallBold" style={styles.monthTitle}>
                  {first.toLocaleDateString(undefined, { month: 'long' })}
                  {year !== parseDay(today).getFullYear() ? ` ${year}` : ''}
                </ThemedText>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map((d, i) => (
                    <ThemedText
                      key={i}
                      type="small"
                      themeColor="textSecondary"
                      style={[styles.weekday, { width: cell }]}>
                      {d}
                    </ThemedText>
                  ))}
                </View>
                <View style={styles.daysGrid}>
                  {cells.map((day, i) => {
                    if (!day) return <View key={`e${i}`} style={{ width: cell, height: cell }} />;
                    const inWindow = day >= windowStart && day <= today;
                    const s = inWindow ? getScore(day) : null;
                    const step = s === null ? -1 : heatStep(s);
                    const fill = step >= 0 ? heat[step] : 'transparent';
                    const strong = step >= 0 && luminance(fill) < 0.36;
                    return (
                      <View key={day} style={{ width: cell, height: cell, padding: 1.5 }}>
                        <View
                          style={[
                            styles.dayCell,
                            { backgroundColor: fill },
                            day === today && { borderWidth: 2, borderColor: theme.text },
                          ]}>
                          <ThemedText
                            style={[
                              styles.dayNum,
                              {
                                color: strong
                                  ? '#ffffff'
                                  : step >= 3
                                    ? '#1a1a1a'
                                    : theme.textSecondary,
                                opacity: inWindow ? 1 : 0.35,
                              },
                            ]}>
                            {parseDay(day).getDate()}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
      <View style={styles.heatLegend}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.legendText}>
          0%
        </ThemedText>
        {heat.map((c, i) => (
          <View key={i} style={[styles.heatSwatch, { backgroundColor: c }]} />
        ))}
        <ThemedText type="small" themeColor="textSecondary" style={styles.legendText}>
          100%
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  readout: {
    minHeight: 44,
    gap: 2,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  plotRow: {
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  yAxis: {
    width: 26,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
  },
  yAxisSpacer: {
    width: 26,
  },
  yTick: {
    fontSize: 10,
    lineHeight: 12,
    marginTop: -6,
    marginBottom: -6,
  },
  plot: {
    flex: 1,
    height: CHART_HEIGHT,
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bars: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  barHit: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  stack: {
    width: '100%',
  },
  segment: {
    borderRadius: 3,
    overflow: 'hidden',
  },
  fillPart: {
    width: '100%',
  },
  ticks: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  tick: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
  },
  legend: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
    gap: Spacing.two,
  },
  keyRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  keySample: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  keyBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderRadius: Spacing.five,
    borderWidth: 1.5,
    paddingVertical: Spacing.one + 3,
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.three,
  },
  pillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pillLabel: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  pillCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  panel: {
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  panelDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  panelClose: {
    fontSize: 15,
    paddingHorizontal: Spacing.one,
  },
  panelRow: {
    gap: Spacing.one,
  },
  panelRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  panelCount: {
    fontVariant: ['tabular-nums'],
  },
  panelTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  panelFill: {
    height: '100%',
    borderRadius: 3,
  },
  heatmap: {
    gap: Spacing.two,
  },
  months: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  month: {
    borderTopWidth: 2,
    paddingTop: Spacing.two,
  },
  monthTitle: {
    marginBottom: Spacing.one,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 14,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    flex: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: 600,
  },
  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  heatSwatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    marginHorizontal: 2,
  },
});
