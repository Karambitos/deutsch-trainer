import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import East from '@mui/icons-material/East';
import MenuBook from '@mui/icons-material/MenuBook';
import Settings from '@mui/icons-material/Settings';
import Quiz from './QuizScreen';
import { db, makeBackup, validateBackup, type Scope } from './database';
import { createSession, levels, type Direction, type Length, type Question } from './quiz';
import { total, schedule, type Progress } from './review';
import { construction, scoped } from './vocabulary';
import { useOffline } from './offline';
import { version } from '../package.json';

type Page = 'home' | 'quiz' | 'results' | 'dictionary' | 'mistakes' | 'settings';
interface Session { level: number; questions: Question[]; index: number; correct: number; incorrect: number; mistakes: boolean }
const descriptions = ['Переклад в обох напрямках', 'Вибір прийменника', 'Відмінки, займенники й закінчення', 'Введення з клавіатури', 'Переклад із самооцінкою', 'Змішані вправи та повторення'];
const offlineLabels = {
  loading: 'Кешуються файли застосунку…', ready: 'Готово до роботи офлайн',
  update: 'Доступна нова версія', error: 'Не вдалося перевірити або оновити офлайн-кеш',
  unsupported: 'Офлайн-кеш доступний у production-збірці через HTTPS або localhost',
};

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [scope, setScope] = useState<Scope>('priority');
  const [direction, setDirection] = useState<Direction>('mixed');
  const [length, setLength] = useState<Length>(10);
  const [session, setSession] = useState<Session>();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [storageFailed, setStorageFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [dialog, setDialog] = useState<'reset' | 'import'>();
  const [backup, setBackup] = useState<unknown>();
  const [search, setSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const offline = useOffline();
  const pool = scoped(scope);
  const visibleIds = new Set(pool.map(entry => entry.id));
  const stats = total(progress.filter(row => visibleIds.has(row.id)));
  const difficult = pool.filter(entry => progress.some(row => row.id === entry.id && row.priority > 0 && row.incorrect > 0));
  const current = session?.questions[session.index];

  useEffect(() => {
    let active = true;
    void db.load().then(saved => {
      if (active) { setScope(saved.scope); setProgress(saved.progress); }
    }).catch(() => { if (active) setStorageFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function go(destination: Page) {
    setPage(destination);
    setMessage(undefined);
    window.scrollTo(0, 0);
  }

  function start(level: number, mistakes = false) {
    const questions = createSession(pool, level, direction, level !== 1 && length === 'both' ? 'all' : length, progress, Date.now(), Math.random, mistakes);
    if (!questions.length) {
      if (page === 'results' && session?.mistakes && mistakes) {
        setSession({ ...session, index: 0, correct: 0, incorrect: 0 });
        go('quiz');
        return;
      }
      setMessage({ text: 'У вибраному наборі немає конструкцій для цієї вправи.' });
      return;
    }
    setSession({ level, questions, index: 0, correct: 0, incorrect: 0, mistakes });
    go('quiz');
  }

  async function changeScope(next: Scope) {
    setScope(next);
    try { await db.settings.put({ key: 'scope', value: next }); }
    catch { setStorageFailed(true); }
  }

  async function record(ok: boolean) {
    if (!current) return;
    setBusy(true);
    const { id } = current.entry;
    const exercise = current.type;
    let row: Progress;
    try {
      row = await db.record(id, exercise, ok);
    } catch {
      setStorageFailed(true);
      row = schedule(id, exercise, ok, Date.now(), progress.find(item => item.id === id && item.exercise === exercise));
    } finally {
      setBusy(false);
    }
    setProgress(previous => [...previous.filter(item => item.id !== id || item.exercise !== exercise), row]);
    setSession(previous => previous && ({
      ...previous, correct: previous.correct + Number(ok), incorrect: previous.incorrect + Number(!ok),
    }));
  }

  function next() {
    if (!session) return;
    if (session.index + 1 === session.questions.length) go('results');
    else {
      setSession({ ...session, index: session.index + 1 });
      window.scrollTo(0, 0);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(makeBackup(progress, scope), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'deutsch-trainer-progress.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_048_576) throw new Error('Файл перевищує 1 МБ.');
      const input: unknown = JSON.parse(await file.text());
      validateBackup(input);
      setBackup(input);
      setDialog('import');
    } catch (error) {
      setMessage({ text: error instanceof SyntaxError ? 'Не вдалося прочитати JSON.' : (error as Error).message, error: true });
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      if (dialog === 'import') {
        const imported = await db.importBackup(backup);
        setProgress(imported.progress);
        setScope(imported.scope);
      } else {
        await db.progress.clear();
        setProgress([]);
      }
      setStorageFailed(false);
      setMessage({ text: dialog === 'import' ? 'Прогрес імпортовано.' : 'Прогрес скинуто.' });
    } catch {
      setStorageFailed(true);
      setMessage({ text: 'Змінити збережений прогрес не вдалося.', error: true });
    } finally {
      setBusy(false);
      setDialog(undefined);
      setBackup(undefined);
    }
  }

  const filter = (
    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
      <ToggleButtonGroup size="small" exclusive color="primary" value={scope} aria-label="Набір лексики"
        onChange={(_, value: Scope | null) => { if (value) void changeScope(value); }}>
        <ToggleButton value="priority">Пріоритетні</ToggleButton><ToggleButton value="all">Усі</ToggleButton>
      </ToggleButtonGroup>
      <Chip label={`Конструкцій: ${pool.length}`} />
    </Stack>
  );

  return (
    <Box className="shell">
      <Stack component="header" direction="row" alignItems="center" spacing={1} sx={{ mb: 3, minHeight: 46 }}>
        {page === 'home' ? <>
          <MenuBook color="primary" />
          <Typography fontWeight={800} sx={{ flex: 1 }}>Deutsch Trainer</Typography>
          <Button aria-label="Налаштування" sx={{ minWidth: 46, px: 0 }} onClick={() => go('settings')}><Settings /></Button>
        </> : <Button startIcon={<ArrowBack />} disabled={busy} onClick={() => go(session?.mistakes && (page === 'quiz' || page === 'results') ? 'mistakes' : 'home')}>Назад</Button>}
      </Stack>
      <Stack component="main" spacing={2.5}>
        {storageFailed && <Alert severity="warning">Локальне сховище недоступне. Зміни можуть зникнути після закриття. За потреби експортуй прогрес.</Alert>}
        {message && <Alert severity={message.error ? 'error' : 'info'}>{message.text}</Alert>}
        {loading ? <Typography role="status">Завантаження прогресу…</Typography> : page === 'home' && <>
          <Stack spacing={1.5} sx={{ pb: 1 }}>
            <Typography variant="h3" component="h1" fontWeight={800} sx={{ fontSize: { xs: '2.35rem', sm: '3.4rem' }, letterSpacing: '-.045em' }}>Німецька щодня</Typography>
            <Typography color="text.secondary">Дієслова, прийменники й речення з повсякденного життя.</Typography>
            {filter}
          </Stack>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select fullWidth label="Напрям перекладу" value={direction} onChange={e => setDirection(e.target.value as Direction)}>
                <MenuItem value="mixed">Змішаний</MenuItem><MenuItem value="de-uk">Deutsch → Українська</MenuItem><MenuItem value="uk-de">Українська → Deutsch</MenuItem>
              </TextField>
              <TextField select fullWidth label="Довжина сесії" value={length}
                onChange={e => setLength(['all', 'both'].includes(e.target.value) ? e.target.value as Length : Number(e.target.value) as Length)}>
                <MenuItem value={5}>5 запитань</MenuItem><MenuItem value={10}>10 запитань</MenuItem><MenuItem value={20}>20 запитань</MenuItem>
                <MenuItem value="all">Усі вибрані конструкції</MenuItem><MenuItem value="both">Обидва напрями (рівень 1)</MenuItem>
              </TextField>
            </Stack>
          </Paper>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            {levels.map((name, index) => <Button key={name} variant="outlined" endIcon={<East />}
              sx={{ justifyContent: 'space-between', textAlign: 'left', py: 1.4, px: 2, bgcolor: 'background.paper' }}
              onClick={() => start(index + 1)}>
              <Box><Typography component="span" display="block" color="text.primary" fontWeight={750}>{index + 1}. {name}</Typography>
                <Typography component="span" variant="body2" color="text.secondary">{descriptions[index]}</Typography></Box>
            </Button>)}
          </Box>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography component="h2" variant="h6">Мій прогрес</Typography>
            <Typography color="text.secondary">Правильно {stats.correct} · Помилок {stats.incorrect} · Повторити {difficult.length}</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              <Button startIcon={<MenuBook />} onClick={() => go('dictionary')}>Словник</Button>
              <Button onClick={() => go('mistakes')}>Мої помилки</Button>
            </Stack>
          </Paper>
        </>}
        {page === 'quiz' && session && current && <Quiz key={session.index} question={current} index={session.index}
          count={session.questions.length} title={session.mistakes ? 'Мої помилки' : levels[session.level - 1]} save={record} next={next} />}
        {page === 'results' && session && <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography component="h1" variant="h4">Підсумок сесії</Typography>
            <Typography variant="h3" color="primary">{Math.round(100 * session.correct / session.questions.length)}%</Typography>
            <Typography>Правильно {session.correct} · Помилок {session.incorrect}</Typography>
            <Typography color="text.secondary">{session.incorrect ? 'Повтори складні конструкції в розділі «Мої помилки».' : 'Спробуй «Автоматизм», щоб застосувати конструкції в різних вправах.'}</Typography>
            <Button variant="contained" onClick={() => start(session.level, session.mistakes)}>Почати знову</Button>
            <Button onClick={() => go('home')}>На головну</Button>
          </Stack>
        </Paper>}
        {(page === 'dictionary' || page === 'mistakes') && <>
          <Typography component="h1" variant="h4">{page === 'dictionary' ? 'Словник' : 'Мої помилки'}</Typography>
          {filter}
          {page === 'dictionary' ? <TextField label="Пошук німецькою або українською" value={search} onChange={e => setSearch(e.target.value)} />
            : <Button variant="contained" disabled={!difficult.length} onClick={() => start(6, true)}>Повторити складні конструкції</Button>}
          {(() => {
            const query = search.trim().toLowerCase();
            const entries = page === 'mistakes' ? difficult : pool.filter(entry =>
              [construction(entry), entry.translationUk, entry.exampleDe].some(value => value.toLowerCase().includes(query)));
            if (!entries.length) return <Alert severity="info">{page === 'mistakes' ? 'У цьому наборі поки немає конструкцій для повторення.' : 'Конструкцій за цим запитом не знайдено.'}</Alert>;
            return entries.map(entry => {
              const rows = progress.filter(row => row.id === entry.id);
              const counts = total(rows);
              return <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
                <Typography component="h2" variant="h6" lang="de">{construction(entry)}</Typography>
                <Typography>{entry.translationUk}</Typography>
                <Typography lang="de" color="primary" sx={{ mt: 1 }}>{entry.exampleDe}</Typography>
                <Typography color="text.secondary">{entry.exampleUk}</Typography>
                {entry.preposition && entry.reflexiveCase && <Typography variant="body2">Зворотний займенник · {entry.reflexiveCase}</Typography>}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Правильно {counts.correct} · Помилок {counts.incorrect}</Typography>
                {rows.some(row => row.priority > 0) && <Typography variant="body2" color="text.secondary">
                  Наступне повторення · {new Date(Math.min(...rows.filter(row => row.priority > 0).map(row => row.due))).toLocaleString('uk-UA')}
                </Typography>}
              </Paper>;
            });
          })()}
        </>}
        {page === 'settings' && <>
          <Typography component="h1" variant="h4">Налаштування</Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography component="h2" variant="h6">Офлайн-доступ</Typography>
              <Typography role="status">{offlineLabels[offline.status]}</Typography>
              {offline.status === 'update' && <Button variant="contained" onClick={() => void offline.applyUpdate()}>Оновити</Button>}
              {offline.status === 'error' && <Button onClick={() => window.location.reload()}>Перевірити знову</Button>}
              <Typography color="text.secondary">Версія {version}</Typography>
            </Stack>
          </Paper>
          <Button variant="outlined" onClick={download}>Експортувати прогрес</Button>
          <Button variant="outlined" onClick={() => fileInput.current?.click()}>Імпортувати прогрес</Button>
          <input ref={fileInput} type="file" hidden accept=".json,application/json" onChange={event => {
            void readFile(event.target.files?.[0]); event.target.value = '';
          }} />
          <Button color="error" variant="outlined" onClick={() => setDialog('reset')}>Скинути прогрес</Button>
        </>}
      </Stack>
      <Dialog open={Boolean(dialog)} onClose={() => { if (!busy) { setDialog(undefined); setBackup(undefined); } }}>
        <DialogTitle>{dialog === 'import' ? 'Замінити поточний прогрес?' : 'Скинути прогрес?'}</DialogTitle>
        <DialogContent>{dialog === 'import' ? 'Дані з файлу замінять поточні результати й набір лексики.' : 'Усі відповіді та історію повторень буде видалено з цього пристрою.'}</DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => { setDialog(undefined); setBackup(undefined); }}>Скасувати</Button>
          <Button disabled={busy} color={dialog === 'reset' ? 'error' : 'primary'} onClick={() => void confirm()}>
            {dialog === 'import' ? 'Імпортувати' : 'Скинути'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
