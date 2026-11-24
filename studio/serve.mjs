import { createServer } from 'node:http';
import { readFile, writeFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { validateSet } from './contract.mjs';
export const ENGINE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(ENGINE, '..');
export function arg(name) { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; }
export function inside(root, target) { const rel = relative(root, target); return !rel.startsWith('..') && !isAbsolute(rel); }
export async function safePath(root, name) {
  const base = await realpath(root), target = await realpath(resolve(base, name));
  if (!inside(base, target)) throw new Error('Percorso fuori dal progetto');
  return target;
}
export async function discoverProjects({ repo = arg('repo'), slug = arg('slug'), dbPath = join(ROOT, 'data/openfindability.db') } = {}) {
  let rows = [];
  if (existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { rows = db.prepare('SELECT slug, flutter_project_path AS repo FROM projects WHERE flutter_project_path IS NOT NULL').all(); }
    finally { db.close(); }
  }
  if (repo) { const key = slug || basename(resolve(repo)).toLowerCase().replace(/[^a-z0-9-]/g, '-'); rows = rows.filter(p => p.slug !== key); rows.push({ slug: key, repo: resolve(repo) }); }
  const projects = [];
  for (const row of rows) {
    if (!/^[a-z0-9-]+$/.test(row.slug)) continue;
    const dir = resolve(row.repo, 'store/studio');
    if (!existsSync(join(dir, 'studio.config.json'))) continue;
    const config = JSON.parse(await readFile(join(dir, 'studio.config.json'), 'utf8'));
    if (!inside(dir, resolve(dir, config.export ?? 'export'))) throw new Error('Directory export fuori dal progetto');
    const setsDir = await safePath(dir, config.sets ?? 'sets');
    const sets = [];
    for (const file of (await readdir(setsDir)).sort()) {
      if (!/^[a-z0-9-]+\.json$/.test(file)) continue;
      const set = validateSet(JSON.parse(await readFile(await safePath(setsDir, file), 'utf8')));
      sets.push({ id: file.slice(0,-5), name: set.name ?? file.slice(0,-5), platforms: set.platforms, locales: set.locales });
    }
    if (!sets.length) continue;
    projects.push({ slug: row.slug, dir, config, sets });
  }
  return projects;
}
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2' };
export async function startServer(port = Number(process.env.STUDIO_PORT ?? 5177), options = {}) {
  let projects = await discoverProjects(options);
  const server = createServer(async (req, res) => {
    try {
      if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host ?? '')) { res.writeHead(403).end('Host non consentito'); return; }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const json = (value) => { res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }).end(JSON.stringify(value)); };
      if (req.method === 'GET' && url.pathname === '/api/projects') {
        projects = await discoverProjects(options);
        json(projects.map(p => ({ slug:p.slug, name:p.config.name ?? p.slug, icon:`/p/${p.slug}/${p.config.icon ?? ''}`, defaultSet:p.config.defaultSet, components:`/p/${p.slug}/${p.config.components ?? 'components.js'}`, css:`/p/${p.slug}/${p.config.css ?? 'components.css'}`, sets:p.sets, setsPath:p.config.sets ?? 'sets' }))); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/save') {
        if (req.headers.origin !== url.origin || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403).end('Origine non consentita'); return; }
        const p = projects.find(p => p.slug === url.searchParams.get('project'));
        const id = url.searchParams.get('set');
        if (!p || !p.sets.some(s => s.id === id)) { res.writeHead(404).end('Progetto o set sconosciuto'); return; }
        req.setEncoding('utf8');
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2_000_000) { res.writeHead(413).end('Set troppo grande'); return; } }
        const data = validateSet(JSON.parse(body));
        const file = await safePath(p.dir, `${p.config.sets ?? 'sets'}/${id}.json`);
        const temp = `${file}.${crypto.randomUUID()}.tmp`;
        try { await writeFile(temp, JSON.stringify(data,null,2)+'\n', { flag:'wx' }); await rename(temp,file); }
        finally { await unlink(temp).catch(() => {}); }
        res.writeHead(204).end(); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      let file;
      const match = url.pathname.match(/^\/p\/([a-z0-9-]+)\/(.+)$/);
      if (match) {
        const p = projects.find(p => p.slug === match[1]); if (!p) { res.writeHead(404).end(); return; }
        const name = decodeURIComponent(match[2]);
        if (name.includes('\\') || name.split('/').some(part => part === '..' || part === '.')) throw new Error('Percorso non valido');
        // Serve only the configured public studio inputs, never exports/archive/config.
        const allowed = [p.config.components ?? 'components.js', p.config.css ?? 'components.css', p.config.icon, `${p.config.sets ?? 'sets'}/`, 'assets/'].filter(Boolean);
        if (!allowed.some(a => a.endsWith('/') ? name.startsWith(a) : name === a)) throw new Error('File non pubblico');
        file = await safePath(p.dir,name);
      } else {
        const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.replace(/^\/engine\//,''));
        if (!['index.html','editor.html','render.html','engine.js','engine.css','helpers.js','components.js','contract.mjs','session.js','chrome.css'].includes(name)) { res.writeHead(404).end(); return; }
        file = await safePath(ENGINE,name);
      }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type':mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 400).end(error.message); }
  });
  await new Promise((ok,fail) => { server.once('error',fail); server.listen(port,'127.0.0.1',ok); });
  return { server, port:server.address().port, projects };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {port} = await startServer();
  console.log(`Store Studio → http://127.0.0.1:${port}/${arg('slug') ? '?project='+encodeURIComponent(arg('slug')) : ''}`);
}
