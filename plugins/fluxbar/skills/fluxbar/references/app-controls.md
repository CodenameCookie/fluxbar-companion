# Right-click controls and apps with multiple servers

Read this guide when a project has a frontend and backend, or when recommending button actions. Recommend one button for the whole app unless the user wants independent service controls. Verify the project's actual startup scripts, working directory, ports and shutdown behaviour before proposing a command.

## Direct app-published menus (toolbar 0.8 / Companion 0.7 helper)

The actual target app can supply its own menu **without Codex, project registration or button suggestions**. In native Buttons, enable **Allow this app to update its right-click menu directly**, save, then create/copy its private reporting setup. This is one-time trust: the app may change the executable commands in its own menu immediately. Nothing runs until you click an entry. The permission does not authorize changing other button settings or other buttons. Do not enable it silently. Disabling it revokes the setup key and hides app entries; create a new setup to reconnect.

The app uses the same local Windows pipe/private setup as lifecycle reporting, but app-menu permission is independent of lifecycle health permission. It begins one run and publishes complete menu snapshots. Manual entries stay separate and appear first; manual and app entries together may contain at most ten entries. A too-large publication is rejected, leaving the prior menu unchanged. An empty snapshot clears only the app's entries.

Windows Node example: copy the bundled `scripts/lifecycle-client.mjs` into the app or import its verified installed location. Native setup creation stays with the user; never read/create/copy keys into chat or source.

```js
import { AppIntegration } from './lifecycle-client.mjs';
const fluxbar = new AppIntegration(process.env.FLUXBAR_SETUP_FILE);
const actions = [
  { label: 'Open dashboard', kind: 'Launch', target: 'http://127.0.0.1:3000' },
  { label: 'Stop backend', kind: 'WSL', distribution: 'Ubuntu-24.04',
    target: 'cd /home/user/projects/my-project && bash scripts/app-control.sh stop-backend' }
]; // Replace with actual verified app commands/URLs.
async function refreshMenu() {
  try { await fluxbar.begin(); await fluxbar.publishMenu(actions); }
  catch { /* Optional integration: continue app startup/shutdown normally. */ }
}
void refreshMenu();
const timer = setInterval(() => void refreshMenu(), 20_000);
timer.unref?.();
```

Call `publishMenu` immediately when the desired actions change and renew the current snapshot while the app is alive. The default lease is 60 seconds (5–120 allowed); expiry hides stale app entries without changing manual entries. Stop the timer during shutdown. Use one integration instance/run per logical button. Commands are launched as configured, not callback functions serialized from app code.

For WSL/other languages, invoke Windows Node helper with `--setup PRIVATE_PATH`, one JSON event on stdin, and a bounded subprocess timeout. Use `operation: "read"`, then `begin` with retained run UUID/expectedGeneration, then `menu-publish` with that run ID/generation, a separate increasing menu sequence, `menuActions` and `leaseSeconds`. Example event shape:

```json
{"operation":"menu-publish","runId":"RETAINED-RUN-UUID","expectedGeneration":2,"sequence":1,"leaseSeconds":60,"menuActions":[{"label":"Open dashboard","kind":"Launch","target":"http://127.0.0.1:3000"}]}
```

The generation and UUID above are placeholders; use returned/retained values. Menu sequence is independent of lifecycle report sequence. Exact duplicate menu packets do not renew the lease; use a new sequence for each refresh. Old runs/generations, out-of-order packets and conflicting duplicate sequences are rejected. Toolbar restart hides cached app menus until fresh publication; the helper refreshes the generation only for its own still-active run and does not replay a failed update. The next freshly evaluated refresh reconnects. Setup is local to the Windows user/session; it is not protection against hostile programs already running as that user.

## Chat-confirmed direct edits (toolbar 0.8 / Companion 0.7)

The AI has a separate direct-edit workflow for existing buttons. It can change appearance, launch/monitoring fields, manual menu entries and app-menu permission in one batch without using native Suggestions. This is not permission for an app to change the whole toolbar.

1. Use status to identify the intended existing button GUIDs. Call `fluxbar_preview_button_changes` with `changes: [{buttonId, patch}, ...]` (up to 32 distinct buttons). Omitted patch fields preserve existing values; `menuActions: []` clears manual actions. With toolbar 0.9+, `patch.iconUrl` stages a verified HTTP/HTTPS PNG/JPEG/ICO image for actual visual preview; empty clears to the built-in fallback and omission preserves the current image. A change item can instead use `remove: true` with no patch to delete the exact identified button.
2. Show the concrete before/after edits, including every new/changed command and permission. Obtain explicit user confirmation in chat for that exact batch. A user request specifying the exact edits is already authorization: do not ask again unnecessarily. General approval to investigate or integrate FluxBar does not authorize unshown edits. A group can be approved together; partial approval covers only that subset.
3. Call `fluxbar_apply_button_changes` with the returned `planId` and concise `userConfirmation` only once authorization is present. The server stores the preview, rejects expiry/concurrent settings changes/open Settings, and commits the batch as one settings save. No actions run. Invalid members reject the whole batch. Plans last five minutes and are single-use. If refreshing an expired plan yields the exact same already-authorized edits, existing approval still applies; material changes need fresh confirmation.
4. Do not invent a user confirmation, approve a native suggestion through another route, or apply extra changes alongside the approved batch. The confirmation argument is a caller assertion, **not host-verified human approval**; the AI must enforce this conversation rule. Native Settings remains available for manual review, and suggestions still wait for native acceptance.

Example preview (replace the GUID with a verified existing button):

```json
{"changes":[{"buttonId":"00000000-0000-0000-0000-000000000001","patch":{"label":"My app","backgroundColour":"#164B49","menuActions":[{"label":"Open dashboard","kind":"Launch","target":"http://127.0.0.1:3000"}]}}]}
```

The apply tool accepts only the stored plan and confirmation, not replacement patches. Before/after output includes only changed fields, not unrelated saved commands. Suggestions remain the preferred draft path when no direct-edit approval exists.

### Favicon imports and removal in one confirmed batch (toolbar 0.9 / Companion 0.8)

The other AI instance must show you what it is about to do and ask for your confirmation before saving. **Updating or installing this plugin is not approval to change an icon or delete a button.** For favicon/removal work, show the staged image and the exact button name, target and GUID being removed, then obtain your explicit approval for that batch. Do not treat discussion of an unwanted button as confirmation of an unshown or ambiguous deletion.

Example preview template (replace both IDs and the URL with verified values):

```json
{"changes":[{"buttonId":"00000000-0000-0000-0000-000000000001","patch":{"iconUrl":"http://127.0.0.1:3000/favicon.ico"}},{"buttonId":"00000000-0000-0000-0000-000000000002","remove":true}]}
```

`fluxbar_preview_button_changes` returns actual MCP image content for each staged favicon, plus source URL/hash metadata and before/after details. This preview image is returned to the AI conversation for review; the native-only picker does not send images to chat. If the tool image is not visible to the user, forward/show the returned preview before asking for approval. A removal has `remove: true`, the exact button identity and `after: null`. Preview can download/cache images, but never changes the toolbar. No arbitrary local image paths are accepted through this tool; local file import remains available in native Settings.

Only after user confirmation call `fluxbar_apply_button_changes` with that plan ID and a truthful concise confirmation. Apply uses the exact staged image bytes, with no refetch; it rejects missing/modified files, expired/replayed plans, concurrent settings changes, open Settings and unsupported removal of an owned workload. Source changes after preview cannot silently substitute another image. Icon updates and removals save together or neither saves. A failed image import blocks grouped removals too. Removing a button does not execute its commands, kill an unowned app, remove a project folder or delete app files; stop an owned workload first.

Downloads retain the five-second per-image/2 MiB limits, no redirects/cookies/default credentials, with a ten-second total staging budget per batch. Large/slow batches should be split into smaller previews. Cleared or changed previews require approval of the actual resulting changes; never invent approval. Suggestions and the native favicon picker remain available as alternative workflows.

## Custom menu actions (Companion 0.6 / toolbar 0.7)

Each button supports **up to 10 custom right-click entries**, in user-selected order. Configure them under Settings → Buttons → **Right-click actions… (up to 10)**. Add/update entries in the editor, use Move up/down or Remove, choose Use actions, then save the button. New / discard draft clears unfinished edits. Cancelling the editor leaves the previous list unchanged.

The plugin can propose `suggestion.menuActions`. Native Suggestions shows every label, kind, command/URL, arguments and WSL distribution, and offers **Review / edit right-click actions…** before Add / update button. Proposed actions never execute on receipt or approval; they run only when the user selects them from that button's actual menu. Omit `menuActions` to preserve an installed list; send `[]` to clear it. Changing a list or its order requires fresh approval. Versions below toolbar 0.7 reject menu proposals before storage.

| Action kind | Target and behaviour |
| --- | --- |
| Launch | Explicit HTTP/HTTPS URL or full Windows .exe/.lnk path; optional executable arguments |
| Windows | Full Windows .exe path and its arguments |
| WSL | Explicit shell command and distribution; put all command arguments in target and leave the separate arguments field blank |
| Start | Start this button's configured managed workload; target/arguments must be empty |
| Stop | Stop this button's owned workload; target/arguments must be empty |
| Restart | Restart this button's owned workload; target/arguments must be empty |

Start requires a managed Windows/WSL button; Stop/Restart require ownership. These menu entries are disabled when unavailable. Labels are for display and never interpreted as commands. Custom Launch/Windows/WSL entries launch the exact approved target; they do not create managed workload ownership. Launch acknowledgement does not prove command completion or app readiness. Use the lifecycle integration and real health checks for progress/results. Long-running scripts should supervise their own children, prevent duplicate launches and write their own logs.

Managed buttons retain the existing Start, Stop owned workload and Restart owned workload entries below a separator. The ten-entry limit applies to custom entries in addition to these standard controls. The plugin has no action-execution or approval tool; only native user interaction runs these entries.

### Example proposals

Adapt these templates to verified project commands/URLs. Do not submit invented script paths, endpoints or placeholder values. A script must implement its named operation; FluxBar does not generate a Stop backend API from the label.

For a managed app button, include friendly whole-app controls and a dashboard:

```json
{"projectId":"my-project","suggestion":{"label":"My app","kind":"WSL","distribution":"Ubuntu-24.04","target":"cd /home/user/projects/my-project && exec bash scripts/dev-app.sh","icon":"Server","menuActions":[{"label":"Start whole app","kind":"Start"},{"label":"Stop whole app","kind":"Stop"},{"label":"Restart whole app","kind":"Restart"},{"label":"Open dashboard","kind":"Launch","target":"http://127.0.0.1:3000"}]}}
```

To control independent components through an existing supervisor's explicit commands:

```json
{"projectId":"my-project","suggestion":{"label":"My app","target":"http://127.0.0.1:3000","menuActions":[{"label":"Start frontend + backend","kind":"WSL","distribution":"Ubuntu-24.04","target":"cd /home/user/projects/my-project && bash scripts/app-control.sh start-all"},{"label":"Stop backend","kind":"WSL","distribution":"Ubuntu-24.04","target":"cd /home/user/projects/my-project && bash scripts/app-control.sh stop-backend"},{"label":"Restart frontend","kind":"WSL","distribution":"Ubuntu-24.04","target":"cd /home/user/projects/my-project && bash scripts/app-control.sh restart-frontend"},{"label":"Open logs","kind":"Launch","target":"http://127.0.0.1:3000/logs"}]}}
```

For Windows, use `kind: "Windows"` with the actual executable path (for example, the project's CLI or PowerShell) and its explicit arguments. A .ps1/.cmd file is not itself an executable target: select the appropriate interpreter executable and pass the verified script as arguments. Do not put secrets in menu commands, URLs or proposals.

## One app button, one foreground supervisor

Use one project-owned script or existing supervisor command to run the required frontend and backend. FluxBar launches and tracks that command. The supervisor remains running until its children finish; it owns startup order, aggregate readiness, logs and cleanup.

Example proposal template, only after this exact script has been created and verified in the target project:

```json
{"projectId":"my-project","suggestion":{"label":"My app","kind":"WSL","distribution":"Ubuntu-24.04","target":"cd /home/user/projects/my-project && exec bash scripts/dev-app.sh","icon":"Server","backgroundColour":"#164B49","textColour":"#CFF9EC","useStatusColours":true,"allowLifecycleReports":true}}
```

Replace the example project ID, distribution, path and script with verified values. This proposal does not create a supervisor. Do not point it at an invented script or submit unchanged placeholder values. For Windows, propose the verified explicit supervisor executable and arguments with `kind: "Windows"`; do not assume a shell script is directly executable.

Avoid commands that merely spawn detached servers and return, or `backend & frontend &` without supervision, waiting and cleanup. Do not daemonize or create new sessions that escape FluxBar's managed process group/job. A retained parent process alone does not prove either service is healthy.

## Recommended supervisor behaviour

1. Prevent duplicate app instances with an atomic ownership/lock mechanism. If a port is occupied, identify the conflict and fail clearly; never kill a process just because it uses that port.
2. Start independent services concurrently. If the frontend requires the backend during startup, wait for the backend's real readiness before starting it. Bound startup waits and clean up children if startup fails halfway through.
3. Report Starting, then Ready only when every required service is usable. Periodically renew Ready while the aggregate checks remain healthy. A successful process spawn is not readiness.
4. If one required service fails, report Degraded with a short detail such as `Backend unavailable; frontend running`. Decide explicitly whether the supervisor keeps the surviving service running or cleans up the whole app. Bound any recovery attempts; avoid endless restart loops.
5. On shutdown, latch Stopping, stop new work where supported, ask children to exit gracefully, and wait for them. Use dependency-aware shutdown order when the app requires it. Reporting failure must not block cleanup. Keep the supervisor alive until child cleanup finishes, then exit with an appropriate result.
6. Restart only after the previous children have exited and released their resources. A new supervisor run gets a new run UUID. Never reuse an earlier run's sequence counter.

These are requirements for the target project's supervisor integration, not an orchestration engine supplied by FluxBar. Check cancellation during startup, partial startup failure, repeated Start/Stop clicks, child crashes, occupied ports, shutdown timeout and restart before declaring the integration complete.

## What Stop actually does today

- **WSL:** FluxBar sends SIGTERM to the owned process group. The supervisor and children may receive it together, so do not promise backend/frontend shutdown ordering from the menu alone. Make cleanup idempotent and compatible with group-wide termination; use an application-specific cooperative mechanism if strict draining/order is necessary.
- **Windows:** FluxBar requests window closure for processes in the owned job. A headless console/server may have no closable window; do not assume this delivers Ctrl+C, SIGTERM or an HTTP shutdown call. Verify graceful stop with the actual Windows supervisor. Native Buttons settings also supports an optional explicit graceful-stop executable/arguments; configure and verify that for headless apps. The plugin cannot propose this stop command yet.
- Force termination is only available through the button's separately configured force-stop opt-in. It is not a graceful shutdown mechanism. Reports do not enable it.

If the current stop mechanism cannot shut the app down safely, explain that limitation and keep stop acceptance pending. Do not label an untested Windows headless integration as fully managed. Closing FluxBar itself does not stop owned workloads.

## Aggregate status and colours

Use one lifecycle reporter in the supervisor for the whole app. Frontend and backend must not independently begin runs against the same button: they would replace each other's run identity. The supervisor combines their health into one status and concise detail. Independent service controls/status can instead use separate approved buttons and separate reporting setups.

| App evidence | Recommended status / automatic colour |
| --- | --- |
| Required services starting | Starting / amber |
| All required services usable | Ready / green |
| A required service fails while the app remains active | Degraded / amber, with component detail |
| Cleanup in progress | Stopping / amber |
| Intentional exit observed by FluxBar | Stopped / neutral |
| Unexpected exit observed by FluxBar | Crashed / red |

These automatic colours require `useStatusColours: true`. Custom colours remain the fallback; recommend deep teal `#164B49` with pale mint `#CFF9EC` for a service button. If adding `healthUrl`, use a verified Windows-reachable HEAD endpoint reflecting the whole app; a frontend-only response cannot prove backend health. Current HTTP failure can degrade reported Ready. Expired reports are unknown rather than fresh readiness; Stopping remains latched. See [lifecycle integration](app-lifecycle.md) for private native setup, leases, sequence/generation rules and the bounded helper.

## Other useful custom entries

Open dashboard/docs/log viewer, run a project's health-check command, invoke its graceful shutdown CLI, pause/resume request handling, or start/stop individual services. These are supported when the app already provides a suitable URL, executable or WSL command. HTTP POST/API operations can be implemented by the app's verified CLI/script; there is no generic HTTP request action or automatic API discovery. Per-entry availability conditions and live per-entry status beyond managed ownership are not implemented.
