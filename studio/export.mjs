// Export project screenshot sets through installed headless Chrome.
// node studio/export.mjs --slug app --set main --strict
// node studio/export.mjs --repo C:/repo --platform ios --locale it
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, arg } from './serve.mjs';

const { server, port, projects } = await startServer(0);
server.unref();
const project = arg('slug') ? projects.find(p => p.slug === arg('slug')) : projects.length === 1 ? projects[0] : null;
if (!project) throw new Error('Seleziona un progetto con --slug o --repo');
const setName = arg('set') ?? project.config.defaultSet ?? project.sets[0]?.id;
if (!project.sets.some(s => s.id === setName)) throw new Error('Set sconosciuto');
const set = JSON.parse(await readFile(join(project.dir, project.config.sets ?? 'sets', `${setName}.json`), 'utf8'));
const here = project.dir;
const query = new URLSearchParams({ project: project.slug, set: setName });

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome non trovato: imposta CHROME_PATH');
  return found;
}

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { timeout: 60000, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.on('error', fail);
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`chrome exit ${code}: ${err.slice(-400)}`))));
  });
}

// Placeholders (e.g. a review not yet copied from the stores) must never ship.
const placeholders = set.elements.filter((e) => e.placeholder && !e.hidden);
if (placeholders.length) {
  throw new Error(`Elementi segnaposto ancora presenti: ${placeholders.map(e => e.id).join(', ')}`);
}

const chrome = chromePath();

const platforms = arg('platform') ? [arg('platform')] : Object.keys(set.platforms);
const locales = arg('locale') ? [arg('locale')] : set.locales;

/** Layout lint (cut / overlap / border) on the full panorama via --dump-dom. */
function dumpDom(url, w, h) {
  return new Promise((ok, fail) => {
    const p = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`,
      '--virtual-time-budget=15000', '--dump-dom', url], { timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    p.on('error', fail);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => (code === 0 ? ok(out) : fail(new Error(`chrome exit ${code}`))));
  });
}

let problems = 0;
try {
  for (const platform of platforms) {
    if (!set.platforms[platform]) throw new Error(`Piattaforma non supportata: ${platform}`);
    const { w, h } = set.platforms[platform];
    for (const locale of locales) {
      if (!set.locales.includes(locale)) throw new Error(`Lingua non supportata: ${locale}`);
      const html = await dumpDom(`http://127.0.0.1:${port}/engine/render.html?${query}&platform=${platform}&locale=${locale}&check=1`, w * set.slides.length, h);
      const match = html.match(/<pre id="report">([\s\S]*?)<\/pre>/);
      const issues = match ? JSON.parse(match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')) : [{ type: 'check', id: '-', detail: 'report non generato' }];
      for (const i of issues) console.warn(`⚠  ${platform}/${locale} ${i.type}: ${i.id} (${i.detail})`);
      problems += issues.length;
      if (process.argv.includes('--check')) continue;
      if (issues.some(i => i.type === 'check')) throw new Error('Render non pronto: esportazione bloccata');
      const dir = join(here, project.config.export ?? 'export', setName, platform, locale);
      await mkdir(dir, { recursive: true });
      for (let i = 1; i <= set.slides.length; i++) {
        const out = join(dir, `${String(i).padStart(2, '0')}.png`);
        const url = `http://127.0.0.1:${port}/engine/render.html?${query}&platform=${platform}&locale=${locale}&slide=${i}`;
        await run(chrome, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
          '--default-background-color=ffffffff', `--window-size=${w},${h}`,
          '--virtual-time-budget=15000', `--screenshot=${out}`, url,
        ]);
        console.log(`✓ ${platform}/${locale}/${String(i).padStart(2, '0')}.png  ${w}×${h}`);
      }
    }
  }
} finally {
  server.close();
}
console.log(problems ? `${problems} problemi di layout da sistemare` : 'Layout pulito: nessun elemento tagliato o sovrapposto');
if (problems && process.argv.includes('--strict')) process.exitCode = 1;
