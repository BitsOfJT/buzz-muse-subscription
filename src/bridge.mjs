// The Muse bridge: one bounded JSON request on stdin, JSON-lines events on
// stdout. It discovers the muse-acp adapter, speaks ACP (JSON-RPC over stdio)
// to it for a single turn, and translates the turn into bridge events.
//
// The adapter drives the genuine Muse client (`muse serve`), which owns
// the subscription sign-in. This bridge never sees, stores, or forwards any
// credential — there is deliberately no token handling in this file.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, normalize } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

// request: max bridge request size. line: max single ACP line from the
// adapter (enforced). output: max accumulated reply text, in UTF-8 bytes —
// the plugin-side line limit leaves escaping headroom over this cap.
export const LIMITS = Object.freeze({ request: 4 * 1024 * 1024, line: 16 * 1024 * 1024, output: 4 * 1024 * 1024 });
export const PLUGIN_VERSION = '1.1.0';

// The only model ids a run may pin. Anything else is rejected before it can
// reach a command line or a generated script; keep in step with MODELS in
// the plugin-side runtime.mjs (the bridge is bundled standalone).
export const MODEL_IDS = new Set(['muse-wonder-1.0', 'muse-spark-1.3', 'muse-ember-1.0']);

export class BridgeError extends Error {}
const fail = (message) => { throw new BridgeError(message); };
export function publicError(error) {
  return error instanceof BridgeError ? error.message : 'The bridge operation failed. Check Muse, muse-acp, and Node.js availability, then retry.';
}

export function expandPath(value, home = homedir()) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) fail('Paths must be absolute paths or start with ~/.');
  if (value === '~') return home;
  if (value.startsWith('~/') || (process.platform === 'win32' && value.startsWith('~\\'))) return normalize(join(home, value.slice(2)));
  if (!isAbsolute(value)) fail('Paths must be absolute paths or start with ~/.');
  return normalize(value);
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value, max, nonempty = false) { return typeof value === 'string' && Buffer.byteLength(value) <= max && (!nonempty || value.length > 0) && !value.includes('\0'); }

export function validateRequest(request) {
  if (!object(request) || !['status', 'run'].includes(request.action)) fail('Invalid bridge request.');
  const fields = request.action === 'run'
    ? ['action', 'adapter', 'model', 'prompt', 'systemPrompt', 'sessionId', 'resume', 'permissionMode', 'cwd']
    : ['action', 'adapter'];
  if (Object.keys(request).some((key) => !fields.includes(key))) fail('Unexpected bridge request field.');
  if (request.adapter !== undefined && request.adapter !== '' && request.adapter !== 'muse-acp') expandPath(request.adapter);
  if (request.adapter !== undefined && typeof request.adapter !== 'string') fail('Invalid muse-acp executable path.');
  if (request.action !== 'run') return request;
  if (request.model !== undefined && request.model !== 'default' && !MODEL_IDS.has(request.model)) fail('Unsupported Muse model.');
  if (!text(request.prompt, 2 * 1024 * 1024, true) || !text(request.systemPrompt ?? '', 1024 * 1024)) fail('Invalid or oversized prompt.');
  if (typeof request.resume !== 'boolean') fail('An explicit resume flag is required.');
  if (request.resume && !text(request.sessionId, 256, true)) fail('A stored session id is required to resume.');
  if (!request.resume && request.sessionId !== undefined && request.sessionId !== null && !text(request.sessionId, 256)) fail('Invalid session id.');
  if (!['default', 'acceptEdits'].includes(request.permissionMode)) fail('Only default and acceptEdits permission modes are supported.');
  expandPath(request.cwd);
  return request;
}

export async function readRequest(input, { signal, timeout = 15000 } = {}) {
  let size = 0;
  const chunks = [];
  const abort = () => input.destroy(new BridgeError('Bridge request cancelled.'));
  const timer = setTimeout(() => input.destroy(new BridgeError('Timed out waiting for a complete bridge request.')), timeout);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) fail('Bridge request cancelled.');
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > LIMITS.request) fail('Bridge request exceeds the size limit.');
      chunks.push(buffer);
    }
    let request;
    try { request = JSON.parse(Buffer.concat(chunks, size).toString('utf8')); } catch { fail('Bridge input must contain exactly one JSON request.'); }
    return request;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// Environment for the adapter child: inherited values minus code-injection
// vectors, proxy overrides, and any stray Muse API-key/token variables that
// could hijack the subscription session, plus the well-known install
// directories a desktop GUI's PATH usually misses.
export function adapterEnv(source = process.env, { home = homedir(), museBin } = {}) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^(?:NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|BASH_ENV|ENV|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|DYLD_.*)$/i.test(key)) continue;
    if (/^(?:HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)$/i.test(key)) continue;
    if (/^MUSE_.*(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(key)) continue;
    if (value !== undefined) env[key] = value;
  }
  const extra = [join(home, '.local', 'bin'), join(home, '.npm-global', 'bin'), '/usr/local/bin', '/opt/homebrew/bin'];
  const parts = (env.PATH || '').split(delimiter).filter(Boolean);
  for (const dir of extra) if (!parts.includes(dir)) parts.push(dir);
  env.PATH = parts.join(delimiter);
  if (museBin) env.MUSE_BIN = museBin;
  return env;
}

function trackChild(child, signal) {
  let killTimer;
  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1500);
  };
  const closed = new Promise((resolve) => {
    child.once('error', () => resolve({ code: null, failed: true }));
    child.once('close', (code) => resolve({ code, failed: false }));
  });
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  return { stop, closed, dispose() { clearTimeout(killTimer); signal?.removeEventListener('abort', stop); } };
}

async function capture(binary, args, { env, timeout = 8000, limit = 4096, signal } = {}) {
  if (signal?.aborted) fail('Bridge operation cancelled.');
  const child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const tracked = trackChild(child, signal);
  const chunks = [];
  let size = 0;
  child.stdout.on('data', (chunk) => { size += chunk.length; if (size <= limit) chunks.push(chunk); });
  child.stderr.on('data', () => {});
  const timer = setTimeout(() => tracked.stop(), timeout);
  try {
    const result = await tracked.closed;
    return { code: result.code, failed: result.failed, output: Buffer.concat(chunks).toString('utf8') };
  } finally { clearTimeout(timer); tracked.dispose(); }
}

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch { return false; }
}

// Finds muse-acp: explicit configured path, then PATH, then the standard
// npm-global and local install locations. Returns a node invocation.
export async function resolveAdapter(adapter, { env = process.env, home = homedir(), signal } = {}) {
  const explicit = adapter !== undefined && adapter !== '' && adapter !== 'muse-acp';
  const candidates = [];
  if (explicit) candidates.push(expandPath(adapter, home));
  else {
    const name = process.platform === 'win32' ? 'muse-acp.cmd' : 'muse-acp';
    const path = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';
    for (const directory of path.split(delimiter)) if (isAbsolute(directory)) candidates.push(join(directory, name));
    candidates.push(join(home, '.local', 'bin', 'muse-acp'), join(home, '.npm-global', 'bin', 'muse-acp'));
  }
  for (const candidate of new Set(candidates)) {
    if (signal?.aborted) fail('Bridge operation cancelled.');
    if (!await executable(candidate)) continue;
    let resolved = candidate;
    try { resolved = await realpath(candidate); } catch { /* keep the candidate */ }
    if (resolved.endsWith('.js')) return { path: candidate, command: process.execPath, args: [resolved] };
    if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(candidate)) {
      // Node refuses to spawn .cmd/.bat shims directly; route through cmd.exe.
      return { path: candidate, command: 'cmd.exe', args: ['/d', '/s', '/c', `"${candidate}"`] };
    }
    return { path: candidate, command: candidate, args: [] };
  }
  if (explicit) fail('The configured muse-acp executable is unavailable.');
  return null;
}

// Finds the genuine Muse client for version display and MUSE_BIN.
export async function resolveMuse({ env = process.env, home = homedir(), signal } = {}) {
  const candidates = [];
  const name = process.platform === 'win32' ? 'muse.exe' : 'muse';
  const path = Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';
  for (const directory of path.split(delimiter)) if (isAbsolute(directory)) candidates.push(join(directory, name));
  candidates.push(join(home, '.local', 'bin', 'muse'));
  let firstFound = null;
  for (const candidate of new Set(candidates)) {
    if (signal?.aborted) fail('Bridge operation cancelled.');
    if (!await executable(candidate)) continue;
    const result = await capture(candidate, ['--version'], { env: adapterEnv(env, { home }), signal }).catch(() => null);
    const match = result?.code === 0 ? result.output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/) : null;
    if (match) return { binary: candidate, version: match[0] };
    firstFound ??= { binary: candidate, version: null };
  }
  return firstFound;
}

const shQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// muse-acp 0.1.x offers no way to pass a model through: it spawns whatever
// MUSE_BIN names and runs `muse serve`. So a pinned model is applied by
// pointing MUSE_BIN at a generated wrapper that inserts `--model <id>`
// immediately after the `serve` subcommand — the serve host's model governs
// every session it loads — and passes all other invocations through
// untouched. The model id comes only from MODEL_IDS above, and the wrapper
// embeds the absolute path of the resolved genuine Muse binary.
export function wrapperContents(realMuse, model) {
  if (process.platform === 'win32') {
    return [
      '@echo off',
      'rem Generated by the buzz-muse-subscription bridge: run the genuine Muse',
      `rem client, adding --model ${model} to \`muse serve\` invocations only.`,
      'if /i not "%~1"=="serve" goto passthrough',
      'set "REST="',
      'shift',
      ':collect',
      'if "%~1"=="" goto launch',
      'set REST=%REST% "%~1"',
      'shift',
      'goto collect',
      ':launch',
      `"${realMuse}" serve --model ${model}%REST%`,
      'exit /b %errorlevel%',
      ':passthrough',
      `"${realMuse}" %*`,
      'exit /b %errorlevel%',
      '',
    ].join('\r\n');
  }
  return [
    '#!/bin/sh',
    '# Generated by the buzz-muse-subscription bridge: run the genuine Muse',
    `# client, adding --model ${model} to \`muse serve\` invocations only;`,
    '# every other invocation passes through untouched.',
    'if [ "$1" = "serve" ]; then',
    '  shift',
    `  exec ${shQuote(realMuse)} serve --model ${model} "$@"`,
    'fi',
    `exec ${shQuote(realMuse)} "$@"`,
    '',
  ].join('\n');
}

export async function modelWrapper(realMuse, model, { home = homedir() } = {}) {
  const dir = join(home, '.buzz', 'muse-subscription', 'bin');
  const file = join(dir, process.platform === 'win32' ? `muse-${model}.cmd` : `muse-${model}`);
  const contents = wrapperContents(realMuse, model);
  try {
    await mkdir(dir, { recursive: true });
    let current = null;
    try { current = await readFile(file, 'utf8'); } catch { /* not written yet */ }
    if (current !== contents) {
      await writeFile(file, contents, { mode: 0o755 });
      if (process.platform !== 'win32') await chmod(file, 0o755);
    }
  } catch {
    fail(`Could not prepare the model launcher for ${model}. Check that ${dir} is writable, or choose Muse default for this agent.`);
  }
  return file;
}

// Minimal ACP (JSON-RPC 2.0 over stdio) client for one adapter process.
class AcpClient {
  constructor(adapter, { env, signal, onUpdate, onPermission }) {
    this.child = spawn(adapter.command, adapter.args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.tracked = trackChild(this.child, signal);
    this.pending = new Map();
    this.nextId = 1;
    this.onUpdate = onUpdate;
    this.onPermission = onPermission;
    this.dead = null;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    this.child.stdout.on('data', (chunk) => {
      if (this.dead) return;
      buffer += decoder.write(chunk);
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        this.receive(line);
        if (this.dead) { buffer = ''; return; }
      }
      if (buffer.length > LIMITS.line) this.failAll(new BridgeError('The muse-acp adapter sent an oversized line.'));
    });
    this.child.stderr.on('data', () => {}); // adapter logs are diagnostics only
    this.child.stdin.on('error', () => {});
    void this.tracked.closed.then(({ code }) => {
      this.failAll(new BridgeError(`The muse-acp adapter exited unexpectedly (${code ?? 'signal'}).`));
    });
  }
  failAll(error) {
    if (this.dead) return;
    this.dead = error;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
    this.tracked.stop();
  }
  receive(line) {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { this.failAll(new BridgeError('The muse-acp adapter sent malformed output.')); return; }
    if (message.id !== undefined && message.id !== null && (message.result !== undefined || message.error !== undefined)) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new BridgeError(rpcMessage(message.error)));
      else entry.resolve(message.result);
      return;
    }
    if (message.method === 'session/update') { this.onUpdate?.(message.params); return; }
    if (message.method === 'session/request_permission' && message.id !== undefined) {
      Promise.resolve()
        .then(() => this.onPermission?.(message.params))
        .then(result => this.respond(message.id, result ?? { outcome: { outcome: 'cancelled' } }))
        .catch(() => this.respondError(message.id));
      return;
    }
    if (message.method && message.id !== undefined) this.respondError(message.id);
  }
  send(payload) {
    if (this.dead) throw this.dead;
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }
  request(method, params, { timeout = 60000, signal } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new BridgeError(`Timed out waiting for the Muse engine (${method}).`)); }, timeout);
      const onAbort = () => { this.pending.delete(id); clearTimeout(timer); reject(new BridgeError('Bridge operation cancelled.')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(value); },
        reject: (error) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error); },
      });
      try { this.send({ jsonrpc: '2.0', id, method, params }); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  notify(method, params) { try { this.send({ jsonrpc: '2.0', method, params }); } catch { /* closing anyway */ } }
  respond(id, result) { try { this.send({ jsonrpc: '2.0', id, result }); } catch { /* closing anyway */ } }
  respondError(id) { try { this.send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unsupported by this client.' } }); } catch { /* closing anyway */ } }
  async close() {
    this.tracked.stop();
    await this.tracked.closed;
    this.tracked.dispose();
  }
}

function rpcMessage(error) {
  const raw = typeof error?.message === 'string' ? error.message.replace(/[\r\n]+/g, ' ').trim().slice(0, 300) : '';
  if (/auth|login|sign.?in|unauthor|credential/i.test(raw)) {
    return 'Muse reports it is not signed in. Run `muse login` in a terminal on this computer, then try again.';
  }
  return raw ? `Muse turn failed: ${raw}` : 'Muse turn failed.';
}

export async function runTurn(request, { emit, signal } = {}) {
  validateRequest(request);
  const cwd = expandPath(request.cwd);
  try { if (!(await stat(cwd)).isDirectory()) fail('The requested working directory does not exist.'); }
  catch { fail('The requested working directory does not exist or is inaccessible.'); }
  const adapter = await resolveAdapter(request.adapter, { signal });
  if (!adapter) fail('muse-acp was not found. Install Muse and the muse-acp adapter, or configure the adapter executable path in the agent settings.');
  const muse = await resolveMuse({ signal }).catch(() => null);
  let museBin = muse?.binary;
  if (request.model && request.model !== 'default') {
    // Never run a pinned-model turn on the wrong model: if the genuine
    // client cannot be located or the wrapper cannot be prepared, fail.
    if (!muse?.binary) fail('The Muse client was not found, so the selected model cannot be applied. Install Muse, or choose Muse default for this agent.');
    museBin = await modelWrapper(muse.binary, request.model);
  }
  const env = adapterEnv(process.env, { museBin });
  let fullText = '';
  let fullBytes = 0;
  let outputTruncated = false;
  // ACP session/load replays prior conversation as session/update
  // notifications. Only output produced after session/prompt is sent
  // belongs to this turn, so accumulation stays gated until then.
  let acceptingOutput = false;
  const seenTools = new Set();
  const denials = [];
  const client = new AcpClient(adapter, {
    env, signal,
    onUpdate: (params) => {
      const update = params?.update;
      if (!update || typeof update !== 'object') return;
      if (!acceptingOutput) return;
      if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text' && typeof update.content.text === 'string') {
        if (!outputTruncated) {
          const chunkText = update.content.text;
          const chunkBytes = Buffer.byteLength(chunkText);
          if (fullBytes + chunkBytes > LIMITS.output) {
            const room = LIMITS.output - fullBytes;
            let slice = chunkText;
            while (slice.length && Buffer.byteLength(slice) > room) slice = slice.slice(0, -1);
            fullText += slice;
            fullBytes += Buffer.byteLength(slice);
            outputTruncated = true;
          } else {
            fullText += chunkText;
            fullBytes += chunkBytes;
          }
        }
        void emit({ type: 'assistant', message: { content: [{ type: 'text', text: fullText }] } });
      } else if (update.sessionUpdate === 'tool_call' && update.toolCallId && !seenTools.has(update.toolCallId)) {
        seenTools.add(update.toolCallId);
        void emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: update.title || update.kind || 'tool' }] } });
      }
    },
    onPermission: (params) => {
      const toolCall = params?.toolCall || {};
      const options = Array.isArray(params?.options) ? params.options : [];
      const editsAllowed = request.permissionMode === 'acceptEdits' && toolCall.kind === 'edit';
      // Allow means allow_once only: selecting allow_always would turn one
      // approval into a standing one, which this plugin never grants.
      const allowOnce = options.find(option => option?.kind === 'allow_once');
      const reject = options.find(option => option?.kind === 'reject_once')
        || options.find(option => typeof option?.kind === 'string' && option.kind.startsWith('reject'));
      const chosen = editsAllowed ? allowOnce : reject;
      if (!(editsAllowed && chosen?.optionId)) denials.push({ tool_name: toolCall.title || toolCall.kind || 'a tool' });
      if (chosen?.optionId) return { outcome: { outcome: 'selected', optionId: chosen.optionId } };
      return { outcome: { outcome: 'cancelled' } };
    },
  });
  try {
    const init = await client.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'buzz-muse-subscription', version: PLUGIN_VERSION },
    }, { timeout: 30000, signal });
    if (!init || typeof init !== 'object') fail('The muse-acp adapter did not complete its handshake.');
    const canLoad = init.agentCapabilities?.loadSession !== false;
    let sessionId;
    let isNew = false;
    if (request.resume && request.sessionId && canLoad) {
      try {
        await client.request('session/load', { sessionId: request.sessionId, cwd, mcpServers: [] }, { timeout: 30000, signal });
        sessionId = request.sessionId;
      } catch { /* fall through to a fresh session */ }
    }
    if (!sessionId) {
      const created = await client.request('session/new', { cwd, mcpServers: [] }, { timeout: 30000, signal });
      if (!created || typeof created.sessionId !== 'string' || !created.sessionId) fail('The Muse engine did not return a session.');
      sessionId = created.sessionId;
      isNew = true;
    }
    await emit({ type: 'bridge_started' });
    // muse-acp 0.1.x has no system-prompt channel, so Buzz's session context
    // rides as a preamble on the first turn of a new session only.
    const systemPrompt = typeof request.systemPrompt === 'string' ? request.systemPrompt.trim() : '';
    const promptText = isNew && systemPrompt ? `${systemPrompt}\n\n---\n\n${request.prompt}` : request.prompt;
    let promptError;
    acceptingOutput = true;
    const result = await client.request('session/prompt', {
      sessionId, prompt: [{ type: 'text', text: promptText }],
    }, { timeout: 31 * 60 * 1000, signal }).catch((error) => { promptError = error; return null; });
    if (signal?.aborted) {
      client.notify('session/cancel', { sessionId });
      fail('Muse run cancelled.');
    }
    if (promptError) throw promptError;
    const stopReason = typeof result?.stopReason === 'string' ? result.stopReason : 'end_turn';
    const ok = stopReason === 'end_turn' || stopReason === 'max_tokens';
    const finalText = outputTruncated
      ? `${fullText}\n\n[Reply truncated — it exceeded the plugin's reply size limit.]`
      : fullText;
    await emit({
      type: 'result', session_id: sessionId,
      result: finalText, is_error: !ok, subtype: stopReason,
      permission_denials: denials,
    });
    return ok ? 0 : 1;
  } finally {
    await client.close();
  }
}

export async function connectionStatus(adapterPath, { signal } = {}) {
  const status = { adapter: null, adapterVersion: null, muse: null, museVersion: null, engineReady: false };
  const muse = await resolveMuse({ signal }).catch(() => null);
  if (muse) { status.muse = muse.binary; status.museVersion = muse.version; }
  const adapter = await resolveAdapter(adapterPath, { signal }).catch(() => null);
  if (!adapter) {
    status.error = 'muse-acp was not found. Install it (npm install -g muse-acp) or configure its executable path in the agent settings.';
    return status;
  }
  status.adapter = adapter.path;
  const client = new AcpClient(adapter, {
    env: adapterEnv(process.env, { museBin: muse?.binary }), signal,
    onUpdate: () => {}, onPermission: () => ({ outcome: { outcome: 'cancelled' } }),
  });
  try {
    const init = await client.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'buzz-muse-subscription', version: PLUGIN_VERSION },
    }, { timeout: 30000, signal });
    status.engineReady = Boolean(init && typeof init === 'object');
    status.adapterVersion = typeof init?.agentInfo?.version === 'string' ? init.agentInfo.version : null;
    if (!status.engineReady) status.error = 'The muse-acp adapter did not complete its handshake.';
  } catch (error) {
    status.error = publicError(error);
  } finally {
    await client.close();
  }
  return status;
}

export async function handleRequest(request, { emit, signal } = {}) {
  validateRequest(request);
  if (request.action === 'status') {
    await emit({ type: 'bridge_status', ...await connectionStatus(request.adapter, { signal }) });
    return 0;
  }
  return await runTurn(request, { emit, signal });
}
