import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Section } from '@/components/habit-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  challengeDays,
  challengeStatus,
  dayKey,
  fmtDay,
  tierFor,
  TROPHY_TIERS,
  useHabits,
} from '@/hooks/use-habits';
import { useRewards, type Feedback } from '@/hooks/use-rewards';
import { useTheme } from '@/hooks/use-theme';
import { useXp } from '@/hooks/use-xp';
import { iconText } from '@/lib/icons';
import { listScheduled, sendTestReminder } from '@/lib/reminders';

function Button({
  label,
  onPress,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'gold' | 'danger';
}) {
  const theme = useTheme();
  const color = tone === 'gold' ? theme.gold : tone === 'danger' ? theme.danger : theme.accent;
  return (
    <Pressable onPress={onPress} style={[styles.button, { borderColor: color }]}>
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Card({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
      <View style={styles.buttons}>{children}</View>
    </ThemedView>
  );
}

/** Developer-only tools to exercise challenges, celebrations and notifications without waiting. */
export function DevTools() {
  const { habits, challenges, settings, devOffset, dev, startChallenge, bonusXp } = useHabits();
  const xp = useXp();
  const { feedback, preview, confetti } = useRewards();
  const [scheduled, setScheduled] = useState<{ title: string; when: Date }[] | null>(null);

  const live = challenges
    .filter((c) => !c.completedAt && !c.dismissed)
    .map((c) => ({ c, habit: habits.find((h) => h.id === c.habitId) }))
    .filter(({ c, habit }) => habit && challengeStatus(c, habit) !== 'won');

  return (
    <Section label="DEVELOPER · ONLY IN DEV BUILDS">
      <Card
        title={`Simulated date: ${fmtDay(dayKey(), { weekday: 'short', month: 'short', day: 'numeric' })}`}
        detail={
          devOffset
            ? `${devOffset > 0 ? '+' : ''}${devOffset} day${Math.abs(devOffset) === 1 ? '' : 's'} from the real date. Reminders are paused while time-traveling.`
            : 'Jump days to live through a challenge in seconds: check in, advance a day, repeat.'
        }>
        <Button label="− 1 day" onPress={() => dev.setOffset(devOffset - 1)} />
        <Button label="+ 1 day" onPress={() => dev.setOffset(devOffset + 1)} />
        {devOffset !== 0 && (
          <Button label="Back to real date" tone="danger" onPress={() => dev.setOffset(0)} />
        )}
      </Card>

      {live.length ? (
        live.map(({ c, habit }) => {
          const done = challengeDays(c, habit).filter((d) => d.state === 'done').length;
          const tier = tierFor(c.length);
          return (
            <Card
              key={c.id}
              title={`${tier.icon} ${tier.name} · ${iconText(habit!.emoji)} ${habit!.name}`}
              detail={`${done}/${c.length} days done. "Final day" leaves just today open, so your next tap on the tile triggers the real trophy moment.`}>
              <Button label="Reset to day 1" onPress={() => dev.setChallengeProgress(c.id, 0)} />
              <Button
                label="Jump to final day"
                tone="gold"
                onPress={() => dev.setChallengeProgress(c.id, c.length - 1)}
              />
              <Button
                label="Win now"
                tone="gold"
                onPress={() => dev.setChallengeProgress(c.id, c.length)}
              />
            </Card>
          );
        })
      ) : (
        <Card title="No active challenge" detail="Start one to test the flow.">
          {habits[0] ? (
            <Button
              label={`Start 3 days on ${iconText(habits[0].emoji)}`}
              onPress={() => startChallenge(habits[0].id, 3)}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Add a habit first.
            </ThemedText>
          )}
        </Card>
      )}

      <Card
        title="Preview celebrations"
        detail="Plays the real animation, sound and haptics without changing data.">
        {TROPHY_TIERS.map((t) => (
          <Button
            key={t.days}
            label={`${t.icon} ${t.days}d`}
            tone="gold"
            onPress={() => preview.trophy(t.days)}
          />
        ))}
        <Button label="✨ Perfect day" onPress={preview.perfect} />
        <Button label="🎉 Confetti" onPress={confetti} />
      </Card>

      <Card
        title="Trophies"
        detail="Grants a finished challenge on your first habit: its trophy and XP (no trophy celebration, but a level-up will still play).">
        {TROPHY_TIERS.map((t) => (
          <Button key={t.days} label={`+ ${t.icon}`} onPress={() => dev.grantTrophy(t.days)} />
        ))}
      </Card>

      <Card
        title={`XP & levels · Level ${xp.level} (${xp.total.toLocaleString()} XP)`}
        detail={`${xp.into}/${xp.needed} XP into this level. Adding XP past a level plays the real level-up and its unlocks.${
          bonusXp ? ` Test bonus in use: ${bonusXp} XP.` : ''
        }`}>
        <Button label="+50 XP" tone="gold" onPress={() => dev.addXp(50)} />
        <Button label="Next level" tone="gold" onPress={() => dev.addXp(xp.needed - xp.into)} />
        <Button label="Preview level-up" tone="gold" onPress={preview.levelUp} />
        {bonusXp > 0 && (
          <Button label="Remove test XP" tone="danger" onPress={() => dev.addXp(-bonusXp)} />
        )}
      </Card>

      <Card
        title="Sounds & haptics"
        detail={settings.sound ? undefined : 'Sounds are off in Rewards above.'}>
        {(['tick', 'complete', 'perfect', 'challenge'] as Feedback[]).map((k) => (
          <Button
            key={k}
            label={k === 'complete' ? 'chime' : k === 'challenge' ? 'fanfare' : k}
            onPress={() => feedback(k)}
          />
        ))}
      </Card>

      {Platform.OS !== 'web' && (
        <Card title="Notifications" detail="Test nudges show even while the app is open.">
          <Button
            label="Send test nudge"
            onPress={() => sendTestReminder(habits, challenges, settings)}
          />
          <Button
            label="Show scheduled"
            onPress={async () => setScheduled(await listScheduled())}
          />
          {scheduled && (
            <View style={styles.scheduled}>
              <ThemedText type="small" themeColor="textSecondary">
                {scheduled.length} scheduled{settings.reminders ? '' : ' (daily reminders are off)'}
              </ThemedText>
              {scheduled.slice(0, 6).map((n, i) => (
                <ThemedText key={i} type="small" numberOfLines={1}>
                  {n.when.toLocaleString(undefined, {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  · {n.title}
                </ThemedText>
              ))}
            </View>
          )}
        </Card>
      )}

      <Card
        title="Data"
        detail="Adds 7 habits with 60 days of history (including quit habits and a shared icon).">
        <Button label="Load demo history" onPress={dev.loadDemo} />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one + Spacing.half,
  },
  scheduled: {
    width: '100%',
    gap: 2,
    marginTop: Spacing.one,
  },
});
