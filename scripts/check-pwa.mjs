import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const base = '/deutsch-trainer/';
const html = await readFile('dist/index.html', 'utf8');
const worker = await readFile('dist/sw.js', 'utf8');
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './');
assert.equal(manifest.display, 'standalone');
assert.ok(html.includes(base + 'manifest.webmanifest'));
const assets = await readdir('dist/assets');
for (const file of ['index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png',
  ...manifest.icons.map(icon => icon.src), ...assets.filter(file => /\.(js|css)$/.test(file)).map(file => 'assets/' + file)]) {
  await readFile('dist/' + file);
  assert.ok(worker.includes(JSON.stringify(file)), `Missing precache asset: ${file}`);
}
console.log('PWA manifest and precache verified.');
