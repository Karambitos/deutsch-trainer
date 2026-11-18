import { useState, type FormEvent } from 'react';
import { Alert, Button, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { construction } from './vocabulary';
import { normalize, type Question } from './quiz';

interface Props {
  question: Question;
  index: number;
  count: number;
  title: string;
  save: (ok: boolean) => Promise<void>;
  next: () => void;
}
export default function Quiz({ question, index, count, title, save, next }: Props) {
  const [value, setValue] = useState('');
  const [assessment, setAssessment] = useState(false);
  const [correct, setCorrect] = useState<boolean>();
  const [saving, setSaving] = useState(false);
  const done = correct !== undefined;
  const self = question.type === 'sentence';
  const caseLabel = question.type === 'case' && ['Akkusativ', 'Dativ'].includes(question.answer);
  const translation = question.type === 'de-uk' || question.type === 'uk-de';
  const hint = self ? 'Напиши переклад німецькою та звір його зі зразком.'
    : translation ? 'Обери відповідну конструкцію або переклад.'
    : caseLabel ? 'Обери відмінок додатка після прийменника.'
    : question.type === 'reflexive' || (question.type === 'case' && !question.entry.preposition)
      ? 'Встав зворотний займенник.'
      : 'Заповни пропуск.';

  async function record(ok: boolean) {
    if (done || saving) return;
    setSaving(true);
    try {
      await save(ok);
      setCorrect(ok);
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || done || assessment) return;
    if (self) setAssessment(true);
    else void record(normalize(value) === normalize(question.answer));
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography component="h1" variant="h6">{title}</Typography>
        <Typography color="text.secondary">{index + 1} / {count}</Typography>
      </Stack>
      <LinearProgress aria-label="Прогрес сесії" variant="determinate" value={(index + Number(done)) * 100 / count} />
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Stack spacing={2}>
          <Typography color="text.secondary">{hint}</Typography>
          <Typography component="h2" variant="h5" lang={self || question.type === 'uk-de' ? 'uk' : 'de'}>
            {question.prompt}
          </Typography>
          {question.hint && <Typography color="text.secondary">{question.hint}</Typography>}
          {question.options ? question.options.map(option => (
            <Button key={option} lang={question.type === 'de-uk' ? 'uk' : 'de'} variant="outlined"
              color={done && option === question.answer ? 'success' : done && option === value ? 'error' : 'primary'}
              disabled={saving || (done && option !== value && option !== question.answer)}
              aria-disabled={done || undefined} sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { if (!done) { setValue(option); void record(option === question.answer); } }}>{option}</Button>
          )) : (
            <Stack component="form" spacing={2} onSubmit={submit}>
              <TextField label={self ? 'Твій переклад' : 'Твоя відповідь'} value={value}
                onChange={event => setValue(event.target.value)} multiline={self} minRows={self ? 3 : undefined}
                disabled={done || assessment || saving} slotProps={{ htmlInput: { lang: 'de', autoCapitalize: self ? 'sentences' : 'none', autoCorrect: 'off', spellCheck: false } }} />
              {!done && !assessment && <Button variant="contained" type="submit" disabled={!value.trim() || saving}>
                {self ? 'Показати зразок' : 'Перевірити'}
              </Button>}
            </Stack>
          )}
          {assessment && <Alert severity="info">
            <Typography lang="de">{question.answer}</Typography>
            Порівняй зміст, порядок слів і граматику. Можливі інші правильні формулювання.
          </Alert>}
          {assessment && !done && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="outlined" disabled={saving} onClick={() => void record(true)}>Мій варіант підходить</Button>
            <Button variant="outlined" disabled={saving} onClick={() => void record(false)}>Хочу повторити</Button>
          </Stack>}
          {done && <Alert severity={correct ? 'success' : 'warning'} role="status">
            {self ? (correct ? 'Зараховано за самооцінкою.' : 'Позначено для повторення.')
              : correct ? 'Правильно!' : `Правильна відповідь: ${question.answer}`}
            {!correct && question.rule && <Typography>{question.rule}</Typography>}
            {!self && <Typography lang="de">{question.entry.exampleDe}</Typography>}
            {translation && <Typography lang="de">{construction(question.entry)}</Typography>}
          </Alert>}
          {done && <Button variant="contained" onClick={next}>{index + 1 === count ? 'Підсумок' : 'Далі'}</Button>}
        </Stack>
      </Paper>
    </Stack>
  );
}
