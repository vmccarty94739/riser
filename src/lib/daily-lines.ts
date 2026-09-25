import { daysBetween, dayKey } from '@/lib/habits';

/**
 * One line per day for the Dashboard summary card, in a fixed rotation so it changes daily
 * and doesn't repeat for two months.
 */
const LINES = [
  'Small steps still move you forward.',
  'You don’t need motivation. You need a start.',
  'Show up today. Future you is watching.',
  'Discipline is choosing what you want most over what you want now.',
  'One check-in at a time. That’s the whole secret.',
  'Consistency beats intensity, every time.',
  'Make today count. Just today.',
  'The chain grows one link at a time.',
  'Done is better than perfect.',
  'You’re one habit away from a better day.',
  'Keep promises to yourself. They matter most.',
  'Tiny wins stack up faster than you think.',
  'Hard days count double.',
  'Momentum is built, not found.',
  'Progress, not perfection.',
  'Your habits are voting for who you’re becoming.',
  'Start where you are. Use what you have.',
  'Five minutes still counts.',
  'The best time was yesterday. The next best is now.',
  'Be stubborn about the goal, flexible about the path.',
  'Every rep is a deposit in your future.',
  'You’ve done hard things before. This is one more.',
  'Win the morning, win the day.',
  'Don’t break the chain.',
  'Small habits, big results.',
  'Easy choices, hard life. Hard choices, easy life.',
  'You’re building something. Keep stacking.',
  'Motivation fades. Routine stays.',
  'Today’s effort is tomorrow’s baseline.',
  'Do it tired. Do it anyway.',
  'Show up for yourself like you’d show up for a friend.',
  'Nobody’s perfect. Just keep coming back.',
  'Slow progress is still progress.',
  'The goal is to be better than yesterday.',
  'One more day of proof that you can.',
  'Your streak is a story. Write another page.',
  'Stay patient. Stay consistent.',
  'Energy follows action. Start moving.',
  'The habit is the reward.',
  'You’re closer than you were yesterday.',
  'Make it easy. Make it daily.',
  'A good day is a series of small good choices.',
  'Keep going. You’re doing better than you think.',
  'Trust the process. Log the day.',
  'Little by little becomes a lot.',
  'Be the person who follows through.',
  'You can’t finish what you don’t start.',
  'Aim for consistent, not flawless.',
  'Build the day you want to repeat.',
  'Every check mark is a promise kept.',
  'Future you says thanks.',
  'Show up, check in, repeat.',
  'Strong habits make hard days easier.',
  'Choose the harder right over the easier wrong.',
  'Your only competition is who you were yesterday.',
  'The work is the win.',
  'Keep the streak alive. It’s worth it.',
  'Every day is a fresh start.',
  'You’re not starting over. You’re continuing.',
  'Great things are built on ordinary days.',
];

/** Today's line. */
export function dailyLine() {
  const n = daysBetween('2026-01-01', dayKey());
  return LINES[((n % LINES.length) + LINES.length) % LINES.length];
}
