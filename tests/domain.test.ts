import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { construction, scoped, vocabulary } from '../src/vocabulary';
import { createSession, normalize } from '../src/quiz';
import { DAY, schedule } from '../src/review';
import { makeBackup, TrainerDatabase, validateBackup } from '../src/database';

const priority = scoped('priority');
const all = scoped('all');
const rng = () => 0.4;

describe('vocabulary audit', () => {
  it('contains all unique constructions with valid data and provenance', () => {
    expect(new Set(all.map(entry => entry.id)).size).toBe(all.length);
    expect(new Set(all.map(entry => entry.translationUk)).size).toBe(all.length);
    expect(new Set(all.map(construction)).size).toBe(all.length);
    expect(new Set(all.flatMap(entry => entry.sourcePages))).toEqual(new Set([1, 2, 3, 4]));
    expect(all).toHaveLength(114);
    expect(priority).toHaveLength(31);
    expect(all.filter(entry => entry.reflexiveCase === 'Dativ')).toHaveLength(8);
    for (const entry of vocabulary) {
      expect(entry.translationUk).toBeTruthy();
      expect(entry.exampleDe).not.toContain('~');
      expect(entry.exampleUk).toBeTruthy();
      expect(['Akkusativ', 'Dativ', null]).toContain(entry.grammaticalCase);
      expect(['Akkusativ', 'Dativ', null]).toContain(entry.reflexiveCase);
      expect(Boolean(entry.preposition)).toBe(Boolean(entry.grammaticalCase));
      expect(entry.gap.split('~')).toHaveLength(entry.preposition ? 2 : 1);
    }
  });

  it('resolves cross-page duplicates and red markings', () => {
    expect(all).toEqual(vocabulary);
    expect(priority).toEqual(all.filter(entry => entry.priority));
    expect(priority.find(entry => entry.id === 'sich-beschäftigen-mit-D')?.sourcePages).toEqual([1, 4]);
    expect(priority.some(entry => entry.id === 'glauben-an-A')).toBe(false);
    expect(priority.some(entry => entry.id === 'sich-ärgern-über-A')).toBe(true);
  });
});

describe('quiz sessions', () => {
  it.each(['de-uk', 'uk-de', 'mixed'] as const)('covers all entries in %s', direction => {
    const questions = createSession(all, 1, direction, 'all', [], 0, rng);
    expect(questions).toHaveLength(all.length);
    expect(new Set(questions.map(question => question.entry.id)).size).toBe(all.length);
    expect(new Set(questions.map(question => question.type)).size).toBe(direction === 'mixed' ? 2 : 1);
    for (const question of questions) {
      const german = construction(question.entry);
      expect(question.prompt).toBe(question.type === 'de-uk' ? german : question.entry.translationUk);
      expect(question.answer).toBe(question.type === 'de-uk' ? question.entry.translationUk : german);
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options?.filter(option => option === question.answer)).toHaveLength(1);
    }
  });

  it('pairs both directions exactly once for each selected entry', () => {
    const questions = createSession(priority, 1, 'de-uk', 'both', [], 0, rng);
    expect(questions).toHaveLength(priority.length * 2);
    for (const direction of ['de-uk', 'uk-de']) {
      const labels = new Set(priority.map(entry => direction === 'de-uk' ? entry.translationUk : construction(entry)));
      for (const item of questions.filter(question => question.type === direction)) {
        expect(item.options).toHaveLength(4);
        expect(item.options?.every(option => labels.has(option))).toBe(true);
      }
    }
    for (const entry of priority) {
      expect(questions.filter(question => question.entry.id === entry.id).map(q => q.type).sort()).toEqual(['de-uk', 'uk-de']);
    }
  });

  it.each([5, 10, 20] as const)('limits a short session to %d', length => {
    expect(createSession(priority, 1, 'mixed', length, [], 0, rng)).toHaveLength(length);
  });

  it('skips ineligible questions and mixes all eight exercise types', () => {
    for (const level of [2, 4]) {
      const questions = createSession(all, level, 'mixed', 'all', [], 0, rng);
      expect(questions).toHaveLength(all.filter(entry => entry.preposition).length);
      for (const question of questions) {
        expect(question.prompt).toContain('___');
        expect(question.answer).toBe(question.entry.preposition);
        if (level === 2) expect(new Set(question.options).size).toBe(4);
      }
    }
    const cases = createSession(all, 3, 'mixed', 'all', [], 0, rng);
    expect(cases).toHaveLength(all.length);
    expect(cases.find(q => q.entry.id === 'sich-etwas-merken-d')?.answer).toBe('mir');
    expect(createSession(priority, 5, 'mixed', 'all').every(q => !q.options && q.answer === q.entry.exampleDe)).toBe(true);
    const mixed = createSession(all, 6, 'mixed', 'all', [], 0, rng);
    expect(new Set(mixed.map(question => question.type)).size).toBe(8);
    expect(new Set(mixed.map(question => question.entry.id)).size).toBe(all.length);
    expect(normalize('  ÜBER ')).toBe('über');
  });

  it('reviews the failed exercise only within the selected scope', () => {
    const marked = schedule(priority[0].id, 'case', false, 0);
    const unmarked = schedule(all.find(entry => !entry.priority)!.id, 'de-uk', false, 0);
    const questions = createSession(priority, 6, 'mixed', 'all', [marked, unmarked], 0, rng, true);
    expect(questions).toHaveLength(1);
    expect(questions[0].entry.id).toBe(marked.id);
    expect(questions[0].type).toBe(marked.exercise);
  });
});

describe('progress persistence', () => {
  const id = priority[0].id;
  it('uses ten minutes after errors and increasing day intervals after success', () => {
    const wrong = schedule(id, 'de-uk', false, 0);
    expect(wrong).toMatchObject({ incorrect: 1, priority: 2, streak: 0, due: 600_000 });
    const first = schedule(id, 'de-uk', true, wrong.due, wrong);
    expect(first).toMatchObject({ incorrect: 1, correct: 1, priority: 1, streak: 1, due: wrong.due + DAY });
    expect(schedule(id, 'de-uk', true, first.due, first)).toMatchObject({ priority: 0, streak: 2, due: first.due + 2 * DAY });
  });

  it('validates backups and rejects duplicate records and invalid IDs', () => {
    const progress = [schedule(id, 'de-uk', true, 0)];
    expect(validateBackup(makeBackup(progress, 'all'))).toEqual({ scope: 'all', progress });
    expect(() => validateBackup(makeBackup([...progress, ...progress], 'all'))).toThrow();
    expect(() => validateBackup(makeBackup([{ ...progress[0], id: 'unknown' }], 'all'))).toThrow();
    expect(() => validateBackup(makeBackup([{ ...progress[0], priority: -1 }], 'all'))).toThrow();
    expect(() => validateBackup(makeBackup([null as never], 'all'))).toThrow();
  });

  it('preserves old records through an upgrade and records concurrent attempts', async () => {
    const old = new Dexie('migration-test');
    old.version(1).stores({ progress: '[id+exercise],id,due', settings: 'key' });
    const first = schedule(id, 'de-uk', false, 1);
    await old.table('progress').put(first);
    await old.table('settings').put({ key: 'scope', value: 'all' });
    old.close();
    const db = new TrainerDatabase('migration-test');
    expect(await db.load()).toEqual({ progress: [first], scope: 'all' });
    await Promise.all([db.record(id, 'de-uk', true, 2), db.record(id, 'de-uk', true, 3)]);
    expect(await db.progress.get([id, 'de-uk'])).toMatchObject({ incorrect: 1, correct: 2 });
    db.close();
    const reopened = new TrainerDatabase('migration-test');
    expect((await reopened.load()).progress).toHaveLength(1);
    await expect(reopened.importBackup({})).rejects.toThrow();
    expect((await reopened.load()).progress).toHaveLength(1);
    await reopened.importBackup(makeBackup([], 'priority'));
    expect(await reopened.load()).toEqual({ scope: 'priority', progress: [] });
    await reopened.delete();
  });
});
