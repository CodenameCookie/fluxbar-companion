# App lifecycle integration (Companion 0.4 / toolbar 0.5)

Use this when an actual application can announce startup, readiness or graceful shutdown. Agent Working/Done activity is separate and must never stand in for service readiness.

## Enable it

1. Propose `allowLifecycleReports: true` on the intended project button. The user reviews this in native Suggestions, or enables **Allow this app to report lifecycle status** in Buttons and saves it.
2. The user selects **Create / copy app reporting setup** in Buttons. This creates a random key scoped to that button and copies the private setup file's path. Creating setup again rotates the key and retires the old run. No plugin tool creates/returns this key.
3. Configure the actual app with that file path. Do not paste its contents into chat, source code, command arguments or logs. The file lives in the current user's FluxBar app-data directory; the local same-user pipe and key prevent accidental cross-button updates, not hostile programs already able to read that user's private files.
4. Configure a managed workload or a suitably specific process observation if confirmed process exit is needed. HTTP failure or a final app message alone cannot prove process exit. Generic names such as `node` can match unrelated apps.

Disabling reports, removing the button or changing its launch/process configuration revokes the key. Setup files are separate from portable profiles; enabling a profile does not provision credentials. Do not enable/report for another project without its intended user approval.

Use one reporting integration per logical button. Do not share its key between independently running apps or replicas. An explicitly begun new app run retires the previous run; a stale reporter must not repeatedly generate new UUIDs to reclaim that button.

## State rules

| Event/evidence | Result |
| --- | --- |
| Begin a unique run | Starting, amber |
| Fresh Ready report | Ready, green |
| Degraded report | Degraded, amber |
| Stopping report or FluxBar stop request | Stopping, amber; ordinary Ready reports are rejected |
| Explicit CancelStopping | Ready, with a new lease |
| Shutdown deadline passes without observed exit | ShutdownOverdue, amber; no automatic killing/restarting |
| Matching run observed alive then absent after stopping | Stopped, neutral grey |
| Matching run observed alive then absent without stopping | Crashed/unexpected exit, red |
| Report lease expires | Unknown, or independently polled HTTP state if configured |

Polling remains active. A successful HTTP response cannot erase Stopping, ShutdownOverdue or a confirmed exit. A healthy process alone does not renew an app-readiness lease. Lifecycle details/run IDs/generation/sequence/receipt/expiry are readable in `state.buttonStatuses[].lifecycle`; keys are never returned.

If the app reports Ready while a current HTTP check fails, show Degraded and retain both pieces of evidence (`lifecycle` and `healthState`) instead of hiding the contradiction. Poll results captured before a run/report change are discarded; the next refresh checks again.

## Run identity and ordering

- Generate a random UUID **once at app startup**, not per heartbeat or reconnect.
- Read the current generation, then begin with that expected generation. Keep that expected value if retrying a lost begin acknowledgement. Do not adopt a newer run's generation to replay an old begin.
- A successful begin returns the new generation. Every report includes the same run ID, that generation, and a strictly increasing sequence (starting at 1).
- Exact duplicate reports are harmless and do not extend the lease. Conflicting duplicates, older sequences and retired generations are rejected.
- Toolbar restart increments the generation while retaining run identity and shutdown/exit fences. Discard failed/in-flight events. Read the generation only if the active run ID still matches, then send a newly evaluated event. Never replay an old Ready event as recovery.
- Readiness leases default to 30 seconds (allowed 5–120). Send real readiness heartbeats about every 10 seconds. Expiry uses the toolbar's monotonic clock, not an app-provided timestamp.
- Stopping is latched, including across toolbar restarts. Heartbeats cannot prolong its original deadline. The shutdown grace defaults to 30 seconds (allowed 5–300); exceeding it is advisory, never permission to kill a process.

## Windows Node app helper

The plugin bundles `scripts/lifecycle-client.mjs`. Import `LifecycleReporter` using the actual installed file location; keep a project copy if the app must outlive plugin cache upgrades. Windows Node is required for the Windows named pipe. This helper has a 500 ms deadline per pipe exchange, a bounded report queue, and rejects superseded readiness updates when shutdown starts. Recovery can perform one additional bounded read. Always catch reporting failures and keep the app's normal startup/shutdown working.

Example to adapt to the existing app's readiness and shutdown hooks:

```js
import { LifecycleReporter } from './lifecycle-client.mjs';

const reporter = new LifecycleReporter(process.env.FLUXBAR_SETUP_FILE);
let ready = false;
let heartbeat;

async function publishReady() {
  if (!ready) return;
  try {
    await reporter.begin(); // Once per helper/app run; retries keep the same run UUID.
    if (ready) await reporter.report('Ready', 'Serving requests');
  } catch { /* Reporting is optional; do not stop the application. */ }
}

// Call only after this app's real readiness checks pass.
function onAppReady() {
  ready = true;
  void publishReady();
  heartbeat = setInterval(() => void publishReady(), 10_000);
  heartbeat.unref?.();
}

// Call from the application's existing shutdown hook before draining work.
async function onAppStopping() {
  ready = false;
  clearInterval(heartbeat);
  try {
    await Promise.race([
      reporter.report('Stopping', 'Draining active connections', { shutdownSeconds: 30 }),
      new Promise(resolve => setTimeout(resolve, 1_000))
    ]);
  } catch { /* Continue normal shutdown even if FluxBar is unavailable. */ }
  // Continue the app's existing graceful shutdown; do not report Stopped yourself.
}
```

The functions above are hooks to wire into the project's actual server lifecycle, not a complete server. Do not mark an app Ready merely because a build or launch command succeeded. If shutdown is cancelled by the actual app, send a new `CancelStopping` report after verifying readiness again.

## WSL and other languages

WSL cannot directly use this Windows pipe. Invoke the helper with Windows Node and send one JSON event on stdin; the helper reads its private setup file on Windows. Do not send the key through WSL arguments or chat. Set a short subprocess timeout and treat any interop/connection error as a dropped optional report. A global WSL interop change is not required or permitted as an automatic workaround.

```text
Windows node.exe <installed-plugin>\scripts\lifecycle-client.mjs --setup <private-setup-path>
```

Examples of stdin payloads, replacing placeholders with real retained values:

```json
{"operation":"read"}
```
```json
{"operation":"begin","runId":"<unique-app-run-uuid>","expectedGeneration":1}
```
```json
{"operation":"report","runId":"<same-app-run-uuid>","expectedGeneration":2,"sequence":1,"state":"Ready","detail":"Serving requests","leaseSeconds":30}
```
```json
{"operation":"report","runId":"<same-app-run-uuid>","expectedGeneration":2,"sequence":2,"state":"Stopping","detail":"Draining connections","shutdownSeconds":30}
```

For an actual app integration using MCP, `fluxbar_report_lifecycle` accepts the same event metadata plus `projectId`. It resolves only that registered project's approved button and reads only that button's native-created setup. The tool never accepts a caller-supplied token, arbitrary credential path or arbitrary button ID. Use it for actual lifecycle events, not inferred agent status. Existing clients must refresh to discover the ninth tool.

For a frontend/backend app, use one supervisor to aggregate readiness and lifecycle reports. See [right-click controls and multi-server supervision](app-controls.md) before choosing a managed command or promising graceful stop.
