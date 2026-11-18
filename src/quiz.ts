import { construction, vocabulary, type Entry } from './vocabulary';
import type { Exercise, Progress } from './review';

export const levels = ['Значення', 'Прийменники', 'Akkusativ / Dativ', 'Напиши прийменник', 'Реальні речення', 'Автоматизм'];
export type Direction = 'de-uk' | 'uk-de' | 'mixed';
export type Length = 5 | 10 | 20 | 'all' | 'both';
export interface Question {
  entry: Entry;
  type: Exercise;
  prompt: string;
  answer: string;
  options?: string[];
  hint?: string;
  rule?: string;
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

// Keep close synonyms out of each other's meaning options.
const nearSynonyms = [
  ['abhängen', 'ankommen'],
  ['anfangen', 'beginnen'],
  ['sich ärgern', 'sich aufregen'],
  ['sich bedanken', 'danken'],
  ['sich bemühen', 'sich bewerben'],
  ['sich kümmern', 'sorgen'],
  ['berichten', 'erzählen', 'reden', 'sprechen', 'sich unterhalten', 'diskutieren', 'sagen', 'handeln'],
  ['sich erkundigen', 'fragen', 'sich informieren'],
  ['klagen', 'schimpfen', 'sich beschweren'],
  ['gehen', 'sich handeln', 'handeln'],
  ['sich treffen', 'sich verabreden'],
];

const prepAlternatives = ['an', 'auf', 'aus', 'bei', 'für', 'gegen', 'mit', 'nach', 'über', 'um', 'unter', 'von', 'vor', 'zu'];
const forms = [
  ['den', 'dem'], ['einen', 'einem'], ['meinen', 'meinem'], ['deinen', 'deinem'],
  ['meine', 'meiner'], ['deine', 'deiner'], ['eine', 'einer'], ['ihre', 'ihrer'],
  ['dir', 'dich'], ['mir', 'mich'],
];
const curatedCases: Record<string, [string, string]> = {
  'helfen-bei-D': ['Hilfst du ___ bei meiner Steuererklärung?', 'mir'],
  'hören-von-D': ['Ich habe lange nichts von ___ gehört.', 'dir'],
  'sprechen-mit-D': ['Ich spreche mit meinem neu___ Kollegen.', 'en'],
  'denken-an-A': ['Denk an dein___ Reisepass.', 'en'],
};

function question(entry: Entry, type: Exercise, random: () => number, pool: Entry[]): Question | undefined {
  const base = { entry, type };
  if (type === 'de-uk' || type === 'uk-de') {
    const germanFirst = type === 'de-uk';
    const label = (item: Entry) => germanFirst ? item.translationUk : construction(item);
    const answer = label(entry);
    const excluded = new Set([entry.verb, ...nearSynonyms.filter(group => group.includes(entry.verb)).flat()]);
    const candidates = pool.filter(item => item.translationUk !== entry.translationUk && !excluded.has(item.verb));
    const distractors = [...new Set(shuffle(candidates, random).map(label))].slice(0, 3);
    return { ...base, prompt: germanFirst ? construction(entry) : entry.translationUk, answer, options: shuffle([answer, ...distractors], random) };
  }
  if (type === 'sentence') return { ...base, prompt: entry.exampleUk, answer: entry.exampleDe };
  if (type === 'prep-choice' || type === 'prep-input') {
    if (!entry.preposition) return;
    const answer = entry.preposition;
    const related = new Set(vocabulary.filter(item => item.verb === entry.verb).map(item => item.preposition));
    const distractors = shuffle(prepAlternatives.filter(prep => !related.has(prep)), random).slice(0, 3);
    return {
      ...base, prompt: entry.gap.replace('~', '___'), answer, hint: entry.exampleUk,
      options: type === 'prep-choice' ? shuffle([answer, ...distractors], random) : undefined,
    };
  }
  if (type === 'reflexive' || (type === 'case' && !entry.preposition)) {
    if (!entry.reflexiveCase) return;
    const pattern = entry.reflexiveCase === 'Dativ' ? /\b(mir|dir)\b/ : /\b(mich|dich|uns|sich)\b/;
    const answer = entry.exampleDe.match(pattern)?.[0];
    if (!answer) return;
    return { ...base, prompt: entry.exampleDe.replace(pattern, '___'), answer,
      options: ['uns', 'sich'].includes(answer) ? undefined : shuffle(forms.find(pair => pair.includes(answer)) ?? [answer], random),
      rule: `Зворотний займенник тут у ${entry.reflexiveCase}. Для ich і du форми різняться: mich/dich або mir/dir.`,
    };
  }
  if (type === 'completion') {
    if (!entry.preposition) return;
    const [before, after] = entry.gap.split('~');
    const [complement, ending = ''] = after.trimStart().split(/(?=\p{P}$)/u);
    const answer = entry.preposition + ' ' + complement;
    const related = new Set(vocabulary.filter(item => item.verb === entry.verb).map(item => item.preposition));
    const options = shuffle(prepAlternatives.filter(prep => !related.has(prep)), random)
      .slice(0, 3).map(prep => prep + ' ' + complement);
    return { ...base, prompt: before + '___' + ending, answer, options: shuffle([answer, ...options], random), hint: entry.exampleUk };
  }
  if (!entry.preposition) return;
  const curated = curatedCases[entry.id];
  const token = entry.gap.split('~ ')[1]?.split(' ')[0]?.replace(/[.!?]$/, '');
  // These forms are distinct in the authored noun phrases; syncretic forms
  // such as plural „den“ in the dative are handled with a case-label question.
  const safe = ['den', 'dem', 'einen', 'einem', 'meinen', 'meinem', 'deinen', 'deinem', 'einer', 'meiner', 'ihrer', 'dir'];
  const answerable = token && safe.includes(token) && !/^(den Öffnungszeiten|den Folgen)\b/.test(entry.gap.split('~ ')[1]);
  const pair = answerable ? forms.find(items => items.includes(token)) : undefined;
  const [prompt, answer] = curated ?? (pair ? [entry.exampleDe.replace(`${entry.preposition} ${token}`, `${entry.preposition} ___`), token] : [entry.exampleDe, entry.grammaticalCase!]);
  const options = curated ? (answer === 'en' ? ['e', 'er', 'em', 'en'] : forms.find(items => items.includes(answer))) : pair ?? ['Akkusativ', 'Dativ'];
  const rule = entry.id === 'helfen-bei-D' ? 'helfen вимагає Dativ для особи: ich → mir.'
    : `У конструкції «${entry.verb} ${entry.preposition}» після ${entry.preposition} вживаємо ${entry.grammaticalCase}.`;
  return { ...base, prompt, answer, options: options && shuffle(options, random), rule };
}

export function createSession(
  pool: Entry[], level: number, direction: Direction, length: Length,
  progress: Progress[] = [], now = Date.now(), random = Math.random, mistakes = false,
): Question[] {
  const relevant = progress.filter(row => row.priority > 0 || row.due <= now);
  const mistakeRows = relevant.filter(row => row.priority > 0 && row.incorrect > 0);
  const weights = new Map<string, number>();
  for (const row of relevant) {
    weights.set(row.id, (weights.get(row.id) ?? 0) + row.priority * 3 + Number(row.due <= now));
  }
  const types: Exercise[] = ['de-uk', 'uk-de', 'prep-choice', 'case', 'reflexive', 'completion', 'sentence', 'prep-input'];
  let ordered = shuffle(pool, random).filter(entry => !mistakes || mistakeRows.some(row => row.id === entry.id));
  if (level === 6 || typeof length === 'number') {
    ordered = ordered.map(entry => ({
      entry,
      rank: -Math.log(Math.max(random(), Number.MIN_VALUE)) / (1 + (weights.get(entry.id) ?? 0)),
    })).sort((a, b) => a.rank - b.rank).map(item => item.entry);
  }
  if (level === 1 && length === 'both') {
    return shuffle(ordered.flatMap(entry => [question(entry, 'de-uk', random, pool)!, question(entry, 'uk-de', random, pool)!]), random);
  }
  const result: Question[] = [];
  for (const entry of ordered) {
    let type: Exercise = direction === 'mixed' ? (result.length % 2 ? 'uk-de' : 'de-uk') : direction;
    if (level === 2) type = 'prep-choice';
    if (level === 3) type = 'case';
    if (level === 4) type = 'prep-input';
    if (level === 5) type = 'sentence';
    if (level === 6) {
      const preferred = mistakes ? mistakeRows.filter(row => row.id === entry.id).sort((a, b) => b.priority - a.priority).map(row => row.exercise) : [];
      const rotated = [...types.slice(result.length % types.length), ...types.slice(0, result.length % types.length)];
      let generated: Question | undefined;
      for (const choice of new Set([...preferred, ...rotated])) {
        generated = question(entry, choice, random, pool);
        if (generated) break;
      }
      if (generated) result.push(generated);
    } else {
      const generated = question(entry, type, random, pool);
      if (generated) result.push(generated);
    }
    if (result.length === length) break;
  }
  return result;
}

export const normalize = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('de');
