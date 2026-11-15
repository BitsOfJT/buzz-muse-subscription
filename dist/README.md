# Muse subscription harness for Buzz

Run the genuine Muse client in Buzz using your own Muse subscription — not a pay-as-you-go Model API key. This independent MIT plugin adds **Muse (subscription)** alongside Buzz's built-in harnesses. No Buzz patch or downgrade is required.

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
- **Muse**, installed and signed in: run `muse login` once in a terminal and complete the sign-in for your Muse subscription.
- **muse-acp 0.1.0 or newer**: `npm install -g muse-acp` (this also places `muse-acp` in your npm-global bin directory, where the plugin looks for it).

Check in a terminal:

```
node --version
muse --version
muse-acp --help
```

Restart Buzz after installing Node, Muse, or muse-acp — a command working in your terminal does not guarantee that an already-running GUI has the updated PATH.

## Quick start

### 1. Install the plugin

In Buzz, open **Settings → Plugins → Manage plugins → Add**. In the Git import form, enter:

| Field | Value |
| --- | --- |
| Git or GitHub repository | `https://github.com/BitsOfJT/buzz-muse-subscription` |
| Ref | `v1.0.0` |
| Folder | `dist` |

Choose **Find**, review the plugin and its declared computer access, then **Install plugin** with **Enable plugin** selected.

Built artifacts are committed. Buzz does not run npm or compile the source. Alternatively, download the repository, extract it, and use **Add from folder → Browse** to select its `dist` directory — not the repository root or `src`.

### 2. Check setup

Open **Settings → Muse (subscription)**. **Check status** detects muse-acp, asks the adapter for its engine handshake (which starts `muse serve` locally), and reports the Muse version it can find. The check spends no model request and does not remotely validate your subscription — the first agent turn does that.

### 3. Create the agent

Create an agent and choose **Muse (subscription)** in the **Harness** menu. That exact entry — the built-in harnesses are different products and will not use your Muse subscription.

| Setting | What to choose |
| --- | --- |
| Working folder | The default `~/.buzz/muse-subscription-workspace` is created automatically. For a project, enter an existing absolute or `~/…` directory on the **agent host**. |
| muse-acp executable | Leave blank for automatic detection. Otherwise enter the absolute path to the `muse-acp` executable on the agent host. |
| Permissions | Start with **Default**. Choose **Accept edits** only if you want file edits approved automatically; it never approves shell commands or other tools. |
| Conversation sessions | **One per thread** keeps unrelated threads separate. **One per channel** shares context within that channel. |
| Agent instructions | Your standing instructions for this agent; never include credentials. Delivered as a preamble on the first turn of each new conversation (see Limitations). |

### 4. Send a first message

Open the agent's **Message** action, or mention it in an authorized Buzz conversation. For a harmless first check, send:

> Reply exactly BUZZ_MUSE_OK. Do not read files or run commands.

If Buzz shows a **reply** count beneath the message, open that thread to see the response. Continue in the same thread to retain its context. Subsequent successful turns resume the associated Muse session; separate agents and conversations have separate associations.

An authentication failure is reported in the conversation — it means the Muse client on the host is not signed in. Fix it with `muse login` in a terminal on that host; never paste credentials into a chat message.

## Known limitations (v1.0.0)

These come from muse-acp 0.1.x, not from Buzz:

- **No Buzz MCP tools.** muse-acp 0.1.x accepts no MCP servers, so Buzz's own tools (posting as the agent, reading files for the agent, and so on) cannot be handed to Muse yet. The agent's final message is posted as its reply instead.
- **No model picker.** muse-acp exposes no per-session model selection; the Muse client uses its own configured default model. The harness therefore offers a single honest "Muse default model" entry rather than a picker that does nothing.
- **Instructions ride as a preamble.** There is no system-prompt channel in muse-acp 0.1.x, so Buzz's session context and your agent instructions are prepended to the first turn of each new conversation. Resumed conversations already carry them.
- **Session resume is best-effort.** Turns resume through ACP `session/load`. If the engine no longer has the session, the bridge starts a fresh one and Buzz supplies recent conversation history.
- **Replies are capped at 4 MB.** A single reply longer than that is truncated and marked as truncated rather than failing the turn.

## Permissions

This harness has no interactive approval prompt. When Muse asks permission for a tool:

- **Default**: the request is refused and reported in the conversation ("Muse permission denied: …"). Nothing is silently approved.
- **Accept edits**: file-edit requests (`edit` kind) are approved automatically. Everything else follows Default.

Neither mode is an OS sandbox, and no permission bypass exists in this plugin.

## Troubleshooting

| Symptom | Check or fix |
| --- | --- |
| Subscription harness is missing | Enable the plugin in Manage plugins. Import the built `dist` folder and use Buzz 1.0.2. |
| muse-acp was not found | Run `npm install -g muse-acp`, restart Buzz, or set the absolute adapter path in the agent's Settings. |
| Engine handshake does not answer | Confirm Muse is installed (`muse --version`) and signed in (`muse login`). The adapter starts `muse serve`; if the client is missing or signed out, the handshake fails. |
| First turn says Muse is not signed in | Run `muse login` in a terminal on the agent host, in the same OS account that runs Buzz, then try again. On macOS, sign in from a desktop terminal session — the client's credentials live behind your login Keychain. |
| Changed workspace or inconsistent context | Stop active work, save the correct host-side workspace, then use **Reset saved conversations…** in the agent's Settings if needed. Previous file changes are not rolled back. |
| A model turn fails mid-run | The report in the conversation carries the engine's stop reason. Retry deliberately if an earlier turn may already have performed an action — failed or interrupted runs are not advertised as safe for automatic replay. |

## Security and permissions

This is a **trusted local plugin, not an OS sandbox**. Muse and its approved tools run as your user and can access that user's files and network. A working folder is not filesystem containment.

- The plugin holds **no credentials at all**: no token field, no credential-store entries, no credential environment variables. Muse's own sign-in state stays inside the Muse client.
- The bridge builds a cleaned environment for the adapter process: code-injection variables (`NODE_OPTIONS`, `LD_*`, `DYLD_*`, …), proxy overrides, and stray `MUSE_*` API-key/token variables are removed so nothing can hijack the subscription session or reroute its traffic.
- The bridge validates every request (bounded sizes, fixed field sets, loopback-free design — it talks to the adapter over stdio only) and never renders the adapter's stderr, which may contain local paths.
- Agent instructions and prompts are processed locally by the Muse client; Muse stores conversation transcripts in its normal local state.
- Updates are explicit. Reimport a reviewed release tag to update; review source changes and computer-access grants before updating. `SHA256SUMS` detects changed bytes but is not a publisher signature.

## Development

```
npm install
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

The bridge bundle is embedded in `dist/plugin.js` as source text and run with `node -e`; it has no runtime imports or downloaded helpers. Tests drive the bridge against a fake ACP agent (`test/fake-acp.mjs`) and spend no subscription requests.

The reference contracts are Buzz v1.0.2's external harness kit, ACP protocol version 1, and muse-acp 0.1.0.

## Acknowledgements

The concept — a Buzz plugin that adds a subscription harness beside the built-ins by driving the genuine client — follows [kvncrw/buzz-claude-subscription](https://github.com/kvncrw/buzz-claude-subscription) by Kevin Crawley (MIT), an independent implementation for Anthropic's Claude Code. This repository is a separate, original implementation for Meta's Muse, built on [muse-acp](https://github.com/sanjay3290/muse-acp) by sanjay3290 (Apache-2.0). Buzz, Muse, and muse-acp retain their own licenses and are not redistributed here.

## License

MIT, copyright Jordan Thompson (BitsOfJT). See `LICENSE`.
