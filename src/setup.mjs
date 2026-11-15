// Readiness for the Muse subscription harness. There are no credentials to
// manage here — Muse owns its subscription sign-in — so setup is detection
// only: is muse-acp installed, does its engine handshake answer, and can the
// Muse client be found.
import { bridgeRequest, safeMessage } from './session.mjs';

export function createSetup(host, source) {
  const listeners = new Set();
  const controllers = new Set();
  const pending = new Map();
  const cache = new Map();
  let epoch = 0;
  let checking;
  let disposed = false;
  let state = {
    revision: 0, status: undefined, error: '',
    connection: { readiness: 'checking', attentionDescription: 'Checking local Muse subscription setup…' },
  };
  const update = change => {
    if (disposed) return;
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };

  async function inspect(adapter = '') {
    adapter = adapter.trim();
    const generation = epoch;
    if (cache.has(adapter)) return cache.get(adapter);
    const existing = pending.get(adapter);
    if (existing) {
      if (existing.epoch === generation) {
        const answer = await existing.done;
        return generation === epoch ? answer : inspect(adapter);
      }
      await existing.done.catch(() => {});
      return inspect(adapter);
    }
    if (disposed) throw new Error('Muse setup is closed.');
    const controller = new AbortController();
    controllers.add(controller);
    const operation = { epoch: generation };
    operation.done = (async () => {
      let answer;
      const code = await bridgeRequest(host, source, { action: 'status', ...(adapter ? { adapter } : {}) }, {
        signal: controller.signal,
        onEvent: event => { if (event.type === 'bridge_status') answer = event; },
      });
      if (code !== 0 || !answer) throw new Error('The Muse bridge did not return installation status. Check Node.js 20+ and the muse-acp installation.');
      if (generation === epoch) cache.set(adapter, answer);
      return answer;
    })().finally(() => {
      controllers.delete(controller);
      if (pending.get(adapter) === operation) pending.delete(adapter);
    });
    pending.set(adapter, operation);
    const answer = await operation.done;
    return generation === epoch ? answer : inspect(adapter);
  }

  function describe(status) {
    if (!status?.adapter) return 'Install Muse and the muse-acp adapter (npm install -g muse-acp) on this computer, then restart Buzz.';
    if (status.error) return status.error;
    if (!status.engineReady) return 'muse-acp was found but its engine handshake did not answer. Confirm Muse is installed and signed in.';
    const adapterBit = `muse-acp${status.adapterVersion ? ` ${status.adapterVersion}` : ''}`;
    const museBit = status.muse ? `Muse${status.museVersion ? ` ${status.museVersion}` : ''}` : 'Muse client not on PATH (the engine handshake answered, so the adapter found it)';
    return `${adapterBit} · ${museBit} — sign-in belongs to Muse itself (run \`muse login\` once in a terminal); this check spends no model request and does not remotely validate the subscription.`;
  }

  function check() {
    if (checking) return checking;
    update({ connection: { ...state.connection, readiness: 'checking' } });
    checking = inspect().then(status => {
      const error = status.error ? safeMessage(status.error) : '';
      const ready = Boolean(status.adapter && status.engineReady && !error);
      update({ status, error, revision: state.revision + 1, connection: {
        readiness: ready ? 'ready' : 'attention',
        attentionLabel: 'Set up Muse',
        attentionDescription: error || describe(status),
      } });
    }, error => update({
      status: undefined, error: safeMessage(error), revision: state.revision + 1,
      connection: { readiness: 'attention', attentionLabel: 'Fix Muse setup', attentionDescription: safeMessage(error) },
    })).finally(() => { checking = undefined; });
    return checking;
  }

  async function refresh() {
    await checking;
    epoch++;
    cache.clear();
    await check();
  }

  return {
    inspect, check, refresh,
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      listeners.clear();
    },
  };
}
