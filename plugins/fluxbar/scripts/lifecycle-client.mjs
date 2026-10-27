// Windows-side app integration. Credentials stay in the user-created setup file, never in argv/results.
import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

async function loadSetup(file) {
  if (process.platform !== 'win32') throw Error('Use Windows Node for the local FluxBar pipe. WSL apps can invoke this script through Windows Node.');
  const raw = await readFile(file, 'utf8');
  if (raw.length > 4096) throw Error('Invalid reporting setup.');
  let setup;
  try { setup = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw Error('Invalid reporting setup.'); }
  if (!/^[0-9a-f-]{36}$/i.test(setup.buttonId ?? '') || !/^[0-9a-f]{64}$/i.test(setup.token ?? '')
      || !/^FluxBar\.Control\.[A-Za-z0-9.-]+$/.test(setup.pipeName ?? '')) throw Error('Invalid reporting setup.');
  return setup;
}

export async function sendLifecycle(setupFile, event) {
  const setup = await loadSetup(setupFile);
  const allowed = ['operation', 'runId', 'sequence', 'state', 'detail', 'leaseSeconds', 'shutdownSeconds', 'expectedGeneration', 'menuActions'];
  if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some(key => !allowed.includes(key))) throw Error('Invalid lifecycle event fields.');
  const request = JSON.stringify({ command: 'lifecycle', lifecycle: {
    ...event, buttonId: setup.buttonId, token: setup.token, runId: event.runId ?? '00000000-0000-0000-0000-000000000000'
  } });
  if (request.length > (event.operation === 'menu-publish' ? 60000 : 4096)) throw Error('Lifecycle event is too large.');
  return new Promise((resolve, reject) => {
    const socket = createConnection(`\\\\.\\pipe\\${setup.pipeName}`);
    let buffer = '', complete = false;
    const finish = (error, value) => {
      if (complete) return;
      complete = true; clearTimeout(timer); socket.destroy();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(Error('FluxBar reporting timed out.')), 500);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(request + '\n'));
    socket.on('error', () => finish(Error('FluxBar reporting is unavailable.')));
    socket.on('end', () => finish(Error('FluxBar reporting connection closed.')));
    socket.on('data', data => {
      buffer += data;
      if (buffer.length > 65536) return finish(Error('FluxBar response exceeds limit.'));
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      try {
        const response = JSON.parse(buffer.slice(0, newline));
        if (!response.success) return finish(Error(response.message ?? 'Lifecycle report rejected.'));
        finish(null, response.data);
      } catch { finish(Error('FluxBar returned an invalid response.')); }
    });
  });
}

export class LifecycleReporter {
  #menuSequence = 0;
  #setupFile; #runId = randomUUID(); #generation; #sequence = 0; #expected; #queue = Promise.resolve(); #pending = 0; #epoch = 0;
  constructor(setupFile) { this.#setupFile = setupFile; }
  begin() {
    const action = this.#queue.then(async () => {
      if (this.#generation !== undefined) return { runId: this.#runId, generation: this.#generation };
      // Read once only: retries must not adopt a newer run's fencing generation.
      this.#expected ??= (await sendLifecycle(this.#setupFile, { operation: 'read' })).generation;
      const view = await sendLifecycle(this.#setupFile, { operation: 'begin', runId: this.#runId, expectedGeneration: this.#expected });
      this.#generation = view.generation;
      return { runId: this.#runId, generation: this.#generation };
    });
    this.#queue = action.catch(() => {}); return action;
  }
  publishMenu(menuActions, { leaseSeconds = 60 } = {}) {
    if (!Array.isArray(menuActions) || menuActions.length > 10) return Promise.reject(Error('Use at most ten app menu actions.'));
    if (this.#pending >= 4) return Promise.reject(Error('App integration queue is full.'));
    let snapshot;
    try { snapshot = structuredClone(menuActions); } catch { return Promise.reject(Error('Invalid app menu entries.')); }
    this.#pending++;
    const action = this.#queue.then(async () => {
      if (this.#generation === undefined) throw Error('Begin this app run before publishing a menu.');
      try {
        return await sendLifecycle(this.#setupFile, { operation: 'menu-publish', runId: this.#runId, expectedGeneration: this.#generation,
          sequence: ++this.#menuSequence, menuActions: snapshot, leaseSeconds });
      } catch (error) {
        try {
          const current = await sendLifecycle(this.#setupFile, { operation: 'read' });
          if (current.runId === this.#runId) this.#generation = current.generation;
        } catch {}
        throw error;
      }
    }).finally(() => { this.#pending--; });
    this.#queue = action.catch(() => {}); return action;
  }

  report(state, detail = '', options = {}) {
    if (!['Starting', 'Ready', 'Degraded', 'Stopping', 'CancelStopping'].includes(state)) return Promise.reject(Error('Invalid lifecycle state.'));
    if (this.#pending >= 4) return Promise.reject(Error('Lifecycle reporting queue is full; drop this update.'));
    if (state === 'Stopping' || state === 'CancelStopping') this.#epoch++;
    const epoch = this.#epoch; this.#pending++;
    const action = this.#queue.then(async () => {
      if (epoch !== this.#epoch && state !== 'Stopping' && state !== 'CancelStopping') throw Error('Lifecycle update superseded by shutdown.');
      if (this.#generation === undefined) throw Error('Begin this app run before reporting.');
      try {
        return await sendLifecycle(this.#setupFile, { operation: 'report', runId: this.#runId, expectedGeneration: this.#generation,
          sequence: ++this.#sequence, state, detail, leaseSeconds: options.leaseSeconds ?? 30, shutdownSeconds: options.shutdownSeconds ?? 30 });
      } catch (error) {
        // Recover the fence only for the same run. Never retry this possibly stale event.
        try {
          const view = await sendLifecycle(this.#setupFile, { operation: 'read' });
          if (view.runId === this.#runId) this.#generation = view.generation;
        } catch {}
        throw error;
      }
    }).finally(() => { this.#pending--; });
    this.#queue = action.catch(() => {}); return action;
  }
}

export { LifecycleReporter as AppIntegration };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--setup') throw Error('Use lifecycle-client.mjs --setup PRIVATE-SETUP-FILE; supply one JSON event on stdin.');
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 60000) throw Error('Input exceeds limit.'); }
    const view = await sendLifecycle(process.argv[3], JSON.parse(input));
    process.stdout.write(JSON.stringify({ success: true, data: view }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ success: false, message: error.message }) + '\n'); process.exitCode = 1;
  }
}
