export const exerciseTypes = ['de-uk', 'uk-de', 'prep-choice', 'case', 'prep-input', 'sentence', 'reflexive', 'completion'] as const;
export type Exercise = typeof exerciseTypes[number];
export interface Progress {
  id: string;
  exercise: Exercise;
  correct: number;
  incorrect: number;
  streak: number;
  priority: number;
  last: number;
  due: number;
}

export const DAY = 86_400_000;
export function schedule(id: string, exercise: Exercise, ok: boolean, now: number, previous?: Progress): Progress {
  const streak = ok ? (previous?.streak ?? 0) + 1 : 0;
  const priority = Math.max(0, (previous?.priority ?? 0) + (ok ? -1 : 2));
  return {
    id, exercise, streak, priority, last: now,
    due: now + (ok ? Math.min(60, 2 ** Math.min(streak - 1, 6)) * DAY : 600_000),
    correct: (previous?.correct ?? 0) + Number(ok),
    incorrect: (previous?.incorrect ?? 0) + Number(!ok),
  };
}

export const total = (rows: Progress[]) => rows.reduce((result, row) => ({
  correct: result.correct + row.correct, incorrect: result.incorrect + row.incorrect,
}), { correct: 0, incorrect: 0 });
