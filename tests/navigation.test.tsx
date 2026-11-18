// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { db } from '../src/database';
import { scoped } from '../src/vocabulary';

vi.mock('../src/offline', () => ({ useOffline: () => ({ status: 'unsupported', applyUpdate: vi.fn() }) }));
beforeEach(async () => {
  window.scrollTo = vi.fn();
  await db.settings.clear();
  await db.progress.clear();
});
afterEach(cleanup);

it('persists the shared filter and returns from the dictionary and quiz', async () => {
  const rendered = render(<App />);
  await screen.findByRole('button', { name: 'Усі' });
  fireEvent.click(screen.getByRole('button', { name: 'Усі' }));
  fireEvent.click(screen.getByRole('button', { name: 'Словник' }));
  expect(screen.getByText(`Конструкцій: ${scoped('all').length}`)).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sich etwas merken' } });
  expect(screen.getByRole('heading', { name: /sich etwas merken/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  fireEvent.click(screen.getByRole('button', { name: /1\. Значення/ }));
  expect(screen.getByRole('progressbar')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  rendered.unmount();
  render(<App />);
  expect((await screen.findByRole('button', { name: 'Усі' })).getAttribute('aria-pressed')).toBe('true');
});

it('records self-assessment only after seeing the reference and confirming', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /5\. Реальні речення/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Твій переклад' }), { target: { value: 'Mein Versuch.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Показати зразок' }));
  expect(await db.progress.count()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Хочу повторити' }));
  await screen.findByText('Позначено для повторення.');
  expect((await db.progress.toArray())[0]).toMatchObject({ incorrect: 1, exercise: 'sentence' });
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  fireEvent.click(screen.getByRole('button', { name: 'Мої помилки' }));
  fireEvent.click(screen.getByRole('button', { name: 'Повторити складні конструкції' }));
  expect(screen.getByRole('textbox', { name: 'Твій переклад' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Мої помилки' })).toBeTruthy();
});
