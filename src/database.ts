import Dexie, { type Table } from 'dexie';
import { exerciseTypes, schedule, type Exercise, type Progress } from './review';
import { vocabulary } from './vocabulary';

export type Scope = 'priority' | 'all';
export class TrainerDatabase extends Dexie {
  progress!: Table<Progress, [string, Exercise]>;
  settings!: Table<{ key: string; value: Scope }, string>;

  constructor(name = 'deutsch-trainer') {
    super(name);
    this.version(1).stores({ progress: '[id+exercise],id,due', settings: 'key' });
    this.version(2).stores({ progress: '[id+exercise],id,due,priority', settings: 'key' });
  }

  async record(id: string, exercise: Exercise, ok: boolean, now = Date.now()) {
    return this.transaction('rw', this.progress, async () => {
      const row = schedule(id, exercise, ok, now, await this.progress.get([id, exercise]));
      await this.progress.put(row);
      return row;
    });
  }

  async load() {
    return this.transaction('r', this.settings, this.progress, async () => ({
      scope: (await this.settings.get('scope'))?.value ?? 'priority',
      progress: await this.progress.toArray(),
    }));
  }

  async importBackup(input: unknown) {
    const backup = validateBackup(input);
    const scope = backup.scope;
    await this.transaction('rw', this.settings, this.progress, async () => {
      await this.progress.clear();
      await this.progress.bulkPut(backup.progress);
      await this.settings.put({ key: 'scope', value: scope });
    });
    return backup;
  }
}

export const db = new TrainerDatabase();
const ids = new Set(vocabulary.map(entry => entry.id));

export function makeBackup(progress: Progress[], scope: Scope) {
  return { format: 'deutsch-trainer', version: 1, scope, progress };
}

export function validateBackup(input: unknown) {
  const invalid = 'Файл не відповідає формату резервної копії Deutsch Trainer.';
  if (!input || typeof input !== 'object') throw new Error(invalid);
  const { format, version, scope, progress } = input as Partial<ReturnType<typeof makeBackup>>;
  if (format !== 'deutsch-trainer' || version !== 1 || (scope !== 'all' && scope !== 'priority')
    || !Array.isArray(progress) || progress.length > ids.size * exerciseTypes.length) throw new Error(invalid);
  const seen = new Set<string>();
  const validated = progress.map(row => {
    if (!row || typeof row !== 'object') throw new Error(invalid);
    const { id, exercise, correct, incorrect, streak, priority, last, due } = row;
    const key = JSON.stringify([id, exercise]);
    if (!ids.has(id) || !exerciseTypes.includes(exercise) || seen.has(key)
      || ![correct, incorrect, streak, priority, last, due].every(n => Number.isSafeInteger(n) && n >= 0 && n < 8.64e15)
      || correct + incorrect === 0 || streak > correct || priority > 2 * incorrect || due < last) throw new Error(invalid);
    seen.add(key);
    return { id, exercise, correct, incorrect, streak, priority, last, due };
  });
  return { scope, progress: validated };
}
