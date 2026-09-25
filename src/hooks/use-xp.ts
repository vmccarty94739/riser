import { dayKey, useHabits } from '@/hooks/use-habits';
import { habitCountOn, levelFor, rankFor, xpBreakdown } from '@/lib/xp';

/**
 * The user's XP breakdown, level and rank, derived from their data, plus `habitCount`: how many
 * habits today's XP is shared across (use it to show what a check-in or trophy is worth now).
 */
export function useXp() {
  const { habits, challenges, bonusXp } = useHabits();
  const breakdown = xpBreakdown(habits, challenges, bonusXp);
  const level = levelFor(breakdown.total);
  return {
    ...breakdown,
    ...level,
    rank: rankFor(level.level),
    habitCount: habitCountOn(habits, dayKey()),
  };
}
