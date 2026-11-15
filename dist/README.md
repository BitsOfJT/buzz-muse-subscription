# Muse subscription harness for Buzz

Run the genuine Muse client in Buzz using your own Muse subscription — not a pay-as-you-go Model API key. This independent MIT plugin adds **Muse (subscription)** alongside Buzz's built-in harnesses. No Buzz patch or downgrade is required.

[Setup](#quick-start) · [Multiple computers](#use-it-from-multiple-computers) · [Sign-in](#sign-in-and-credentials) · [Troubleshooting](#troubleshooting) · [Security](#security-and-permissions) · [Development](#development)

Not affiliated with or endorsed by Meta or Block. Use your own account and follow Muse's terms of use.

## How it works

```
Buzz ──▶ this plugin ──▶ Node bridge ──ACP (stdio)──▶ muse-acp ──▶ muse serve (genuine Muse client) ──▶ your Muse subscription
```

Meta locks Muse subscription keys to the genuine Muse client, so third-party tools that call the API directly are refused. This harness never calls the API itself: it drives the real client through [muse-acp](https://github.com/sanjay3290/muse-acp), the open-source ACP adapter for Muse, so every request originates from the client your subscription already trusts.

There is **no token to paste and nothing to store**. Sign-in belongs to the Muse client (`muse login`); the plugin never sees, saves, or forwards your credentials.

## Requirements

Install these on the computer that will **run the agent**:

- **Buzz desktop 1.0.2.** External harness APIs are previews; other versions need verification.
- **Node.js 20 or newer**, available as `node` to the desktop application.
- **Muse**, installed and signed in on that computer (see [Sign-in and credentials](#sign-in-and-credentials)).
- **muse-acp 0.1.0 or newer**: `npm install -g muse-acp`. This places `muse-acp` in your npm-global bin directory, where the plugin looks for it.

Check the executables in a terminal:

```sh
node --version
muse --version
muse-acp --help
```

Restart Buzz after installing Node, Muse, or muse-acp if its running desktop process has an old PATH. A command working in your terminal does not guarantee that an already-running GUI can find it.

On macOS, Muse keeps its sign-in in your login Keychain. Sign in from a desktop terminal session in the same OS account that runs Buzz; an SSH-only session may not be able to reach the Keychain.

## Quick start

### 1. Install the plugin

In Buzz, open **Settings → Plugins → Manage plugins → Add**. In the Git import form, enter:

| Field | Value |
| --- | --- |
| Git or GitHub repository | `https://github.com/BitsOfJT/buzz-muse-subscription` |
| Ref | `v1.0.1` |
| Folder | `dist` |

Choose **Find**, review the plugin and its declared computer access, then **Install plugin** with **Enable plugin** selected.

Built artifacts are committed. Buzz does not run npm or compile the source. Alternatively, download the repository, extract it, and use **Add from folder → Browse** to select its `dist` directory — not the repository root or `src`.

Use `v1.0.1` or another reviewed release tag for reproducible installation. `main` changes over time.

### 2. Sign in and check setup

If you have not already, sign the Muse client in once, in a terminal on the agent host:

```sh
muse login
```

Complete the sign-in for your Muse subscription. There is nothing to copy into Buzz: no token field exists, and the plugin holds no credentials.

Then open **Settings → Muse (subscription)** and choose **Check status**. It detects muse-acp, asks the adapter for its engine handshake (which starts `muse serve` locally), and reports the Muse version it can find. The check spends no model request and does not remotely validate your subscription — the first agent turn does that.

### 3. Create the agent

Create an agent and choose **Muse (subscription)** in the **Harness** menu. Choose that exact entry — the built-in harnesses are different products and will not use your Muse subscription.

| Setting | What to choose |
| --- | --- |
| Working folder | The default `~/.buzz/muse-subscription-workspace` is created automatically. For a project, enter an existing absolute or `~/…` directory on the **agent host**, not on another computer. |
| muse-acp executable | Leave blank for automatic detection. Otherwise enter the absolute path to the `muse-acp` executable on the agent host. |
| Permissions | Start with **Default**. Choose **Accept edits** only if you want file edits approved automatically; it never approves shell commands or other tools. |
| Conversation sessions | **One per thread** keeps unrelated threads separate. **One per channel** shares context within that channel. |
| Agent instructions | Your standing instructions for this agent; never include credentials. They are delivered as a preamble on the first turn of each new conversation (see [Known limitations](#known-limitations)). |

When setup is ready, choose **Create agent**.

### 4. Send a first message

Open the agent's **Message** action, or mention it in an authorized Buzz conversation. For a harmless first check, send:

> Reply exactly BUZZ_MUSE_OK. Do not read files or run commands.

If Buzz shows a **reply** count beneath the message, open that thread to see the response. Continue in the same thread to retain its context. Subsequent successful turns resume the associated Muse session; separate agents and conversations have separate associations.

An authentication failure is reported in the conversation — it means the Muse client on the host is not signed in. Fix it with `muse login` in a terminal on that host; never paste credentials into a chat message.

## Use it from multiple computers

Run the agent on one computer that stays online with Buzz open and Muse signed in. Sign into the same Buzz community from your other computers and message the hosted agent there.

You do not need a separate Muse login on every computer merely to message that agent. Install this plugin, Node, Muse, and muse-acp on another computer only if that computer will **host its own agent**. Workspaces and executable paths always refer to the host. The plugin does not sync or distribute sign-ins between devices.

Closing Buzz or suspending the host can stop new turns. This is not a background cloud service.

## Sign-in and credentials

There is no token to generate, replace, or remove — that is the point of driving the genuine client instead of holding a credential.

- **Sign in:** `muse login` in a terminal on the agent host. Muse manages its own sign-in state from then on.
- **Sign out or switch accounts:** use Muse's own commands on the host. The plugin has nothing to delete; uninstalling it removes no credentials because it never stored any.
- **Expiry:** if the client's sign-in lapses, the first failing turn reports it in the conversation. Run `muse login` again on the host.

## Agent settings and conversation resets

In Buzz 1.0.2, open the agent's card, choose **Identity**, and scroll past the identity details to the harness controls. Edit the configuration and choose **Save settings**. Saving does not stop work already running; updated settings apply to later turns. Changing the workspace, adapter path, or conversation scope starts a new session association. Updated instructions do not discard the session.

**Reset saved conversations…** stops the agent's active turns and clears its saved session associations. It does not undo previous tool actions or delete Muse's transcript files. Failed or interrupted runs are not advertised as safe for automatic replay: retry deliberately if an earlier turn may already have performed an action.

When a new Muse session is required, Buzz supplies a bounded recent history, not a complete archive. Keep durable project instructions in the agent's configuration rather than relying on an old chat message. Standalone watch/timer jobs are not implemented, and runs interrupted by quitting Buzz are not automatically resumed.

## Known limitations

These come from muse-acp 0.1.x, not from Buzz:

- **No Buzz MCP tools.** muse-acp 0.1.x accepts no MCP servers, so Buzz's own tools (posting as the agent, reading files for the agent, and so on) cannot be handed to Muse yet. The agent's final message is posted as its reply instead.
- **No model picker.** muse-acp exposes no per-session model selection; the Muse client uses its own configured default model. The harness therefore offers a single honest "Muse default model" entry rather than a picker that does nothing.
- **Instructions ride as a preamble.** There is no system-prompt channel in muse-acp 0.1.x, so Buzz's session context and your agent instructions are prepended to the first turn of each new conversation. Resumed conversations already carry them.
- **Session resume is best-effort.** Turns resume through ACP `session/load`. If the engine no longer has the session, the bridge starts a fresh one and Buzz supplies recent conversation history.
- **Replies are capped at 4 MB.** A single reply longer than that is truncated and marked as truncated rather than failing the turn.

## Troubleshooting

| Symptom | Check or fix |
| --- | --- |
| Subscription harness is missing | Enable the plugin in Manage plugins. Import the built `dist` folder and use Buzz 1.0.2. |
| muse-acp was not found | Run `npm install -g muse-acp`, restart Buzz, or set the absolute adapter path in the agent's settings. |
| Node/helper cannot launch | Install native Node 20+, ensure the desktop application can find `node`, and restart Buzz after PATH changes. |
| Engine handshake does not answer | Confirm Muse is installed (`muse --version`) and signed in (`muse login`). The adapter starts `muse serve`; if the client is missing or signed out, the handshake fails. |
| First turn says Muse is not signed in | Run `muse login` in a terminal on the agent host, in the same OS account that runs Buzz. On macOS, sign in from a desktop terminal session — the client's credentials live behind your login Keychain, and an SSH-only session may be refused. |
| An action needs approval | This harness has no interactive terminal permission prompt. In **Default** mode the action is denied and reported. **Accept edits** permits file edits, not arbitrary shell commands. |
| Changed workspace or inconsistent context | Stop active work, save the correct host-side workspace, then use **Reset saved conversations…** if needed. Previous file changes are not rolled back. |
| A model turn fails mid-run | The report in the conversation carries the engine's stop reason. Retry deliberately if an earlier turn may already have performed an action. |
| “Ready” but no answer is visible | Open the message's reply thread. Confirm the host is online and the message mentions an agent authorized for that conversation. |

## Security and permissions

This is a **trusted local plugin, not an OS sandbox**. Muse and its approved tools run as your user and can access that user's files and network. A working folder is not filesystem containment.

- The plugin holds **no credentials at all**: no token field, no credential-store entries, no credential environment variables. Muse's own sign-in state stays inside the Muse client.
- The bridge builds a cleaned environment for the adapter process: code-injection variables (`NODE_OPTIONS`, `LD_*`, `DYLD_*`, …), proxy overrides, and stray `MUSE_*` API-key/token variables are removed so nothing can hijack the subscription session or reroute its traffic.
- The bridge validates every request (bounded sizes, fixed field sets) and talks to the adapter over stdio only — no network listener. It never renders the adapter's stderr, which may contain local paths.
- When Muse asks permission for a tool: **Default** refuses and reports it in the conversation; **Accept edits** approves file-edit (`edit` kind) requests only. Approvals are one-time, never "always". No permission-bypass mode exists in this plugin.
- Agent instructions and prompts are processed locally by the Muse client; Muse stores conversation transcripts, prompts, and tool results in its normal local state. This plugin does not encrypt those transcripts.
- Updates are explicit. The manifest omits the optional update policy, so reimport a reviewed release tag to update; review source changes and computer-access grants before updating. `SHA256SUMS` detects changed bytes but is not a publisher signature.

Use an immutable release tag or commit when reproducibility matters. `main` changes over time.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run build
```

| File | Responsibility |
| --- | --- |
| `src/plugin.jsx` | Buzz registration and lifecycle wiring |
| `src/ui.jsx` | Setup status card and agent configuration components |
| `src/setup.mjs` | Detection, status caching, and readiness |
| `src/runtime.mjs` | Turn admission, publication, cancellation, and retirement |
| `src/session.mjs` | Bridge transport, stream framing, conversation lanes, persisted session associations |
| `src/bridge-cli.mjs` | Bounded stdin request and JSON-lines response entrypoint |
| `src/bridge.mjs` | Request validation, adapter/Muse discovery, the ACP client, and permission policy |

The bridge bundle is embedded in `dist/plugin.js` as source text and run with `node -e`; it has no runtime imports, separate runtime assets, or downloaded helper executable. The plugin uses Buzz's React instance.

The reference contracts are [Buzz v1.0.2](https://github.com/block/buzz-app/tree/v1.0.2)'s external harness kit, ACP protocol version 1, and muse-acp 0.1.0. Buzz, Muse, and muse-acp retain their own licenses and are not redistributed here.

### Verification

- **Tests:** 12 bridge tests drive the shipped bridge against a fake ACP agent (`test/fake-acp.mjs`), covering request validation, environment hygiene, the permission policy (default-deny and accept-edits), session resume including history-replay handling, and output caps. They spend no subscription requests.
- **Bundle smoke:** after building, the compiled `dist/plugin.js` bridge is exercised through the same `node -e` boundary Buzz uses, against the fake adapter — status and a full scripted turn.
- **macOS desktop (build machine):** the built bridge, run against the real muse-acp 0.1.0, completed the genuine engine handshake (`muse serve` answered; Muse 1.4.20 detected), and a fresh clone of the published release verifies `SHA256SUMS` and passes all tests.
- **Not yet exercised end-to-end:** a model turn inside the Buzz UI. The remote test prompt reached the engine and created a session, but the turn was cancelled because the host's Muse sign-in sits behind the macOS login Keychain, which refuses non-desktop (SSH) processes. The first in-Buzz message is the remaining check; the plugin's own layers are all verified up to that boundary.

Do not commit credentials, private emails, hostnames, real account paths, network addresses, or unredacted screenshots. Use synthetic fixtures and relative/home-relative examples.

## Acknowledgements

The concept — a Buzz plugin that adds a subscription harness beside the built-ins by driving the genuine client — follows [kvncrw/buzz-claude-subscription](https://github.com/kvncrw/buzz-claude-subscription) by Kevin Crawley (MIT), an independent implementation for Anthropic's Claude Code. This repository is a separate, original implementation for Meta's Muse, built on [muse-acp](https://github.com/sanjay3290/muse-acp) by sanjay3290 (Apache-2.0).

## License

[MIT](LICENSE), copyright Jordan Thompson (`BitsOfJT`).
