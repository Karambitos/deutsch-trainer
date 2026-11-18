import source from './vocabulary.txt?raw';

type Case = 'Akkusativ' | 'Dativ';
export interface Entry {
  id: string;
  verb: string;
  preposition: string | null;
  grammaticalCase: Case | null;
  reflexiveCase: Case | null;
  translationUk: string;
  exampleDe: string;
  exampleUk: string;
  priority: boolean;
  sourcePages: number[];
  gap: string;
}

const entries = new Map<string, Entry>();
let page = 0;
for (const row of source.trim().split('\n')) {
  if (row.startsWith('#')) {
    page = Number(row.slice(1));
    continue;
  }
  const priority = row.startsWith('*');
  const [verb, prep, code, translationUk, gap, exampleUk] = row.replace(/^\*/, '').split('|');
  const id = [verb, prep, code].filter(Boolean).join('-').replaceAll(' ', '-');
  const existing = entries.get(id);
  if (existing) {
    existing.sourcePages.push(page);
    existing.priority ||= priority;
    continue;
  }
  entries.set(id, {
    id, verb, preposition: prep || null,
    grammaticalCase: code === 'A' ? 'Akkusativ' : code === 'D' ? 'Dativ' : null,
    reflexiveCase: code === 'd' ? 'Dativ' : verb.startsWith('sich ') ? 'Akkusativ' : null,
    translationUk, gap, exampleDe: gap.replace('~', prep), exampleUk, priority, sourcePages: [page],
  });
}

export const vocabulary = [...entries.values()];
export const scoped = (scope: 'priority' | 'all') => vocabulary.filter(entry => scope === 'all' || entry.priority);
export function construction(entry: Entry) {
  if (entry.preposition) return `${entry.verb} ${entry.preposition} + ${entry.grammaticalCase}`;
  return entry.reflexiveCase ? `${entry.verb} (sich: ${entry.reflexiveCase})` : entry.verb;
}
