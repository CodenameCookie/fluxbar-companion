// Shared stdio entry point. Windows hosts stay native; WSL hosts forward to Windows Node.
import { accessSync, constants } from 'node:fs';
import { release } from 'node:os';
import { posix, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const executable = path => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } };
const convertPath = (path, flag) => execFileSync('wslpath', [flag, path], { encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 }).trim();

export function launchPlan({ platform = process.platform, kernel = release(), env = process.env,
  server = fileURLToPath(new URL('./server.mjs', import.meta.url)), canExecute = executable, convert = convertPath } = {}) {
  if (platform === 'win32') return { mode: 'native' };
  if (platform !== 'linux' || !/microsoft/i.test(kernel))
    throw Error('FluxBar Companion needs native Windows or WSL on the same Windows machine as FluxBar. Standalone/remote Linux is not supported.');
  const requested = env.FLUXBAR_WINDOWS_NODE;
  const search = name => (env.PATH ?? '').split(':').filter(Boolean).map(folder => posix.join(folder, name));
  let candidates;
  if (requested) {
    const path = /^[a-z]:[\\/]|^\\\\/i.test(requested) ? convert(requested, '-u') : requested;
    candidates = path.includes('/') ? [path] : search(path);
  } else {
    candidates = [...search('node.exe'), '/mnt/c/Program Files/nodejs/node.exe', '/mnt/c/nvm4w/nodejs/node.exe'];
  }
  const command = candidates.find(canExecute);
  if (!command) throw Error('Windows Node was not found. Install Node 18+ on Windows, or set FLUXBAR_WINDOWS_NODE to its WSL path (for example /mnt/c/Program Files/nodejs/node.exe).');
  const windowsServer = convert(server, '-w');
  if (!windowsServer) throw Error('Could not translate the plugin path for Windows. Check WSL interoperability.');
  // A Windows-mounted working directory also avoids UNC cwd failures in child CLIs.
  return { mode: 'wsl', command, args: [windowsServer], cwd: posix.dirname(command) };
}

export async function launch() {
  if (Number(process.versions.node.split('.')[0]) < 18) throw Error('FluxBar Companion requires Node 18 or later on the Codex host.');
  const plan = launchPlan();
  if (plan.mode === 'native') { process.chdir(dirname(process.execPath)); await import('./server.mjs'); return; }
  // Retain the exec-based Bash handoff on WSL: Codex's local executor can fail
  // Windows interoperability when Node spawns node.exe directly.
  const child = spawn('bash', [fileURLToPath(new URL('./launch.sh', import.meta.url))], {
    cwd: plan.cwd, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, FLUXBAR_WINDOWS_NODE: plan.command }
  });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = signals.map(signal => () => child.kill(signal));
  signals.forEach((signal, index) => process.on(signal, handlers[index]));
  child.once('error', () => {
    process.stderr.write('FluxBar Companion could not start Windows Node. Check FLUXBAR_WINDOWS_NODE and this session\'s WSL interoperability.\n');
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    signals.forEach((name, index) => process.off(name, handlers[index]));
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await launch(); }
  catch (error) { process.stderr.write(`FluxBar Companion: ${error.message}\n`); process.exitCode = 1; }
}
