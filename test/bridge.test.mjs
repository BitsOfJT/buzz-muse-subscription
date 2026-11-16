import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { adapterEnv, handleRequest, validateRequest } from '../src/bridge.mjs';
import { configOf } from '../src/runtime.mjs';

const fakePath = fileURLToPath(new URL('./fake-acp.mjs', import.meta.url));

async function fakeAdapterScript() {
  const dir = await mkdtemp(join(tmpdir(), 'buzz-muse-test-'));
  const script = join(dir, 'fake-acp-bin');
  await writeFile(script, `#!/bin/sh\nexec node ${fakePath}\n`);
  await chmod(script, 0o755);
  return script;
}

async function runRequest(request) {
  const events = [];
  const code = await handleRequest(request, { emit: event => { events.push(event); } });
  return { code, events };
}

test('validateRequest rejects junk and accepts a status request', () => {
  assert.throws(() => validateRequest({ action: 'save', token: 'x' }));
  assert.throws(() => validateRequest({ action: 'run', prompt: 'hi' }));
  assert.throws(() => validateRequest({ action: 'status', extra: true }));
  assert.equal(validateRequest({ action: 'status' }).action, 'status');
});

test('adapterEnv strips injection vectors and stray Muse keys, augments PATH', () => {
  const env = adapterEnv({ PATH: '/usr/bin', NODE_OPTIONS: '--require evil', MUSE_API_KEY: 'secret', MUSE_CODE_HOST: 'https://api.meta.ai', KEEP: '1' }, { home: '/home/tester' });
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.MUSE_API_KEY, undefined);
  assert.equal(env.MUSE_CODE_HOST, 'https://api.meta.ai');
  assert.equal(env.KEEP, '1');
  assert.ok(env.PATH.split(':').includes('/home/tester/.local/bin'));
  assert.ok(env.PATH.split(':').includes('/home/tester/.npm-global/bin'));
});

test('status handshake against the fake adapter', async () => {
  const adapter = await fakeAdapterScript();
  const { code, events } = await runRequest({ action: 'status', adapter });
  assert.equal(code, 0);
  const status = events.find(event => event.type === 'bridge_status');
  assert.ok(status, 'expected a bridge_status event');
  assert.equal(status.engineReady, true);
  assert.equal(status.adapterVersion, '9.9.9');
  assert.equal(status.adapter, adapter);
});

test('status with a missing configured adapter reports, not throws', async () => {
  const { code, events } = await runRequest({ action: 'status', adapter: '/nonexistent/muse-acp' });
  assert.equal(code, 0);
  const status = events.find(event => event.type === 'bridge_status');
  assert.equal(status.adapter, null);
  assert.match(status.error, /muse-acp was not found/);
});

test('run in default mode streams text and records the edit denial', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  const { code, events } = await runRequest({
    action: 'run', adapter, cwd, prompt: 'Say hello.', systemPrompt: '',
    sessionId: null, resume: false, permissionMode: 'default',
  });
  assert.equal(code, 0);
  assert.ok(events.some(event => event.type === 'bridge_started'));
  const result = events.find(event => event.type === 'result');
  assert.ok(result, 'expected a result event');
  assert.equal(result.session_id, 'fake-session-1');
  assert.match(result.result, /Hello world perm=reject-1/);
  assert.equal(result.is_error, false);
  assert.deepEqual(result.permission_denials, [{ tool_name: 'Edit file' }]);
});

test('run in acceptEdits mode allows the edit and records no denial', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  const { code, events } = await runRequest({
    action: 'run', adapter, cwd, prompt: 'Edit something.', systemPrompt: '',
    sessionId: null, resume: false, permissionMode: 'acceptEdits',
  });
  assert.equal(code, 0);
  const result = events.find(event => event.type === 'result');
  assert.match(result.result, /perm=allow-1/);
  assert.deepEqual(result.permission_denials, []);
});

test('resume falls back to a fresh session when load fails', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  process.env.FAKE_ACP_FAIL_LOAD = '1';
  try {
    const { code, events } = await runRequest({
      action: 'run', adapter, cwd, prompt: 'Continue.', systemPrompt: '',
      sessionId: 'fake-session-1', resume: true, permissionMode: 'default',
    });
    assert.equal(code, 0);
    const result = events.find(event => event.type === 'result');
    assert.equal(result.session_id, 'fake-session-1');
    assert.match(result.result, /Hello world/);
  } finally {
    delete process.env.FAKE_ACP_FAIL_LOAD;
  }
});

test('resume ignores history replayed by session/load', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  process.env.FAKE_ACP_REPLAY = '1';
  try {
    const { code, events } = await runRequest({
      action: 'run', adapter, cwd, prompt: 'Continue.', systemPrompt: '',
      sessionId: 'fake-session-1', resume: true, permissionMode: 'default',
    });
    assert.equal(code, 0);
    const result = events.find(event => event.type === 'result');
    assert.ok(result, 'expected a result event');
    assert.doesNotMatch(result.result, /OLD HISTORY/);
    assert.match(result.result, /Hello world/);
    for (const event of events) {
      if (event.type !== 'assistant') continue;
      for (const part of event.message.content) {
        if (part.type === 'text') assert.doesNotMatch(part.text, /OLD HISTORY/);
      }
    }
  } finally {
    delete process.env.FAKE_ACP_REPLAY;
  }
});

test('acceptEdits still denies a non-edit tool call', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  process.env.FAKE_ACP_NONEDIT = '1';
  try {
    const { code, events } = await runRequest({
      action: 'run', adapter, cwd, prompt: 'Run something.', systemPrompt: '',
      sessionId: null, resume: false, permissionMode: 'acceptEdits',
    });
    assert.equal(code, 0);
    const result = events.find(event => event.type === 'result');
    assert.match(result.result, /perm=reject-1/);
    assert.deepEqual(result.permission_denials, [{ tool_name: 'Run command' }]);
  } finally {
    delete process.env.FAKE_ACP_NONEDIT;
  }
});

test('acceptEdits never selects allow_always', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  process.env.FAKE_ACP_ALLOW_ALWAYS_ONLY = '1';
  try {
    const { code, events } = await runRequest({
      action: 'run', adapter, cwd, prompt: 'Edit something.', systemPrompt: '',
      sessionId: null, resume: false, permissionMode: 'acceptEdits',
    });
    assert.equal(code, 0);
    const result = events.find(event => event.type === 'result');
    assert.match(result.result, /perm=cancelled/);
    assert.deepEqual(result.permission_denials, [{ tool_name: 'Edit file' }]);
  } finally {
    delete process.env.FAKE_ACP_ALLOW_ALWAYS_ONLY;
  }
});

test('max_tokens stop reason counts as a successful turn', async () => {
  const adapter = await fakeAdapterScript();
  const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
  process.env.FAKE_ACP_MAX_TOKENS = '1';
  try {
    const { code, events } = await runRequest({
      action: 'run', adapter, cwd, prompt: 'Say hello.', systemPrompt: '',
      sessionId: null, resume: false, permissionMode: 'default',
    });
    assert.equal(code, 0);
    const result = events.find(event => event.type === 'result');
    assert.equal(result.subtype, 'max_tokens');
    assert.equal(result.is_error, false);
  } finally {
    delete process.env.FAKE_ACP_MAX_TOKENS;
  }
});

// A throwaway HOME holding a fake `muse` binary, so model runs resolve the
// fake client and write their wrapper under the fake home — never the real
// one. Returns the paths the assertions need.
async function fakeHome() {
  const home = await mkdtemp(join(tmpdir(), 'buzz-muse-home-'));
  const bin = join(home, '.local', 'bin');
  await mkdir(bin, { recursive: true });
  const muse = join(bin, 'muse');
  await writeFile(muse, '#!/bin/sh\necho "muse 9.9.9"\n');
  await chmod(muse, 0o755);
  return { home, muse, state: join(home, 'acp-state.json') };
}

async function runWithFakeHome(request) {
  const saved = { HOME: process.env.HOME, PATH: process.env.PATH, FAKE_ACP_STATE: process.env.FAKE_ACP_STATE, MUSE_BIN: process.env.MUSE_BIN };
  const fake = await fakeHome();
  process.env.HOME = fake.home;
  process.env.PATH = [join(fake.home, '.local', 'bin'), dirname(process.execPath), '/usr/bin', '/bin'].join(':');
  process.env.FAKE_ACP_STATE = fake.state;
  delete process.env.MUSE_BIN;
  try {
    const adapter = await fakeAdapterScript();
    const cwd = await mkdtemp(join(tmpdir(), 'buzz-muse-cwd-'));
    const result = await runRequest({ ...request, adapter, cwd });
    return { ...result, fake };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('run with a pinned model spawns the adapter with a MUSE_BIN wrapper', async () => {
  const { code, fake } = await runWithFakeHome({
    action: 'run', prompt: 'Say hello.', systemPrompt: '',
    sessionId: null, resume: false, permissionMode: 'default', model: 'muse-spark-1.3',
  });
  assert.equal(code, 0);
  const spawned = JSON.parse(await readFile(fake.state, 'utf8'));
  const wrapper = join(fake.home, '.buzz', 'muse-subscription', 'bin', 'muse-muse-spark-1.3');
  assert.equal(spawned.museBin, wrapper);
  const contents = await readFile(wrapper, 'utf8');
  assert.ok(contents.includes(fake.muse), 'wrapper must invoke the resolved genuine muse binary');
  assert.ok(contents.includes('serve --model muse-spark-1.3'), 'wrapper must add --model after serve');
  const mode = (await stat(wrapper)).mode;
  assert.ok(mode & 0o111, 'wrapper must be executable');
});

test('run with the default model spawns the adapter with the plain binary', async () => {
  const { code, fake } = await runWithFakeHome({
    action: 'run', prompt: 'Say hello.', systemPrompt: '',
    sessionId: null, resume: false, permissionMode: 'default', model: 'default',
  });
  assert.equal(code, 0);
  const spawned = JSON.parse(await readFile(fake.state, 'utf8'));
  assert.equal(spawned.museBin, fake.muse);
  await assert.rejects(stat(join(fake.home, '.buzz')), 'no wrapper state dir may be created');
});

test('unknown models normalize to default and are rejected by the bridge', () => {
  assert.equal(configOf({ model: 'claude-opus-4' }).model, 'default');
  assert.equal(configOf({ model: 'muse-spark-1.3' }).model, 'muse-spark-1.3');
  assert.equal(configOf({}).model, 'default');
  assert.throws(() => validateRequest({
    action: 'run', prompt: 'hi', resume: false, permissionMode: 'default', cwd: '/tmp', model: 'claude-opus-4',
  }));
  assert.equal(validateRequest({
    action: 'run', prompt: 'hi', resume: false, permissionMode: 'default', cwd: '/tmp', model: 'muse-spark-1.3',
  }).model, 'muse-spark-1.3');
});

test('bridge CLI entrypoint answers a status request over stdio', async () => {
  const adapter = await fakeAdapterScript();
  const cliPath = fileURLToPath(new URL('../src/bridge-cli.mjs', import.meta.url));
  const { stdout, code } = await new Promise((resolve, reject) => {
    const child = execFile('node', [cliPath], (error, out) => {
      if (error && typeof error.code !== 'number') reject(error);
      else resolve({ stdout: out, code: error ? error.code : 0 });
    });
    child.stdin.end(JSON.stringify({ action: 'status', adapter }));
  });
  assert.equal(code, 0);
  const events = stdout.trim().split('\n').map(line => JSON.parse(line));
  const status = events.find(event => event.type === 'bridge_status');
  assert.ok(status, 'expected a bridge_status event');
  assert.equal(status.engineReady, true);
});
