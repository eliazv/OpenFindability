import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, STUDIO_IDENTITY } from '../studio/serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

export async function ensureStudio({ port = 5177, start = startServer, request = fetch } = {}) {
  try {
    const { server } = await start(port);
    return { port, reused: false, close: () => new Promise((ok) => { server.close(ok); server.closeIdleConnections(); }) };
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    // Never kill another process, or silently reuse a different local application.
    let status;
    try {
      const response = await request(`http://127.0.0.1:${port}/api/studio/status`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) status = await response.json();
    } catch { /* The occupied port is not a compatible studio. */ }
    if (status?.service !== 'openfindability-studio' || status?.instance !== STUDIO_IDENTITY || status?.protocol !== 1) {
      throw new Error(`La porta ${port} è occupata da un altro servizio. Liberala prima di avviare OpenFindability.`);
    }
    return { port, reused: true, close: async () => {} };
  }
}

function terminateChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((ok) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => { child.kill(); ok(); });
      killer.once('exit', ok);
    });
  }
  return new Promise((ok) => { child.once('exit', ok); child.kill('SIGTERM'); });
}

export async function runDashboard({
  mode = 'dev', args = [], ensure = ensureStudio,
  spawnNext = (argv) => spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...argv], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  }),
  terminate = terminateChild, signals = process,
  setExitCode = (code) => { process.exitCode = code; }, log = console.log,
} = {}) {
  if (!['dev', 'start'].includes(mode)) throw new Error('Modalità dashboard non valida');
  const studio = await ensure();
  log(`Store Studio ${studio.reused ? 'già attivo' : 'avviato'} → http://127.0.0.1:${studio.port}/`);
  let child;
  try { child = spawnNext([mode, '--hostname', '127.0.0.1', ...args]); }
  catch (error) { await studio.close(); throw error; }
  let stopping;
  const stop = (code = 0, kill = true) => {
    if (stopping) return stopping;
    stopping = (async () => {
      signals.off('SIGINT', interrupt); signals.off('SIGTERM', interrupt);
      if (kill) await terminate(child);
      await studio.close();
      setExitCode(code);
    })();
    return stopping;
  };
  const interrupt = () => { void stop(0); };
  signals.on('SIGINT', interrupt); signals.on('SIGTERM', interrupt);
  child.once('error', (error) => { console.error(`Impossibile avviare la dashboard: ${error.message}`); void stop(1, false); });
  child.once('exit', (code) => { void stop(code ?? 1, false); });
  return { child, studio, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runDashboard({ mode: process.argv[2] ?? 'dev', args: process.argv.slice(3) }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
