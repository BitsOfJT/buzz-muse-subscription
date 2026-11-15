// Turn lifecycle for the Muse subscription harness: admission, session
// association, bridge invocation, reply publication, and retirement.
import { bridgeRequest, SessionLanes, SessionStore, sessionKey, TurnOutput, safeMessage, abortError, finalReply } from './session.mjs';

export const defaults = () => ({
  cwd: '~/.buzz/muse-subscription-workspace',
  permissionMode: 'default', instructions: '', scope: 'thread', adapter: '',
});

export function configOf(config) {
  const value = { ...defaults(), ...config };
  for (const name of ['cwd', 'adapter', 'instructions']) value[name] = String(value[name] ?? '').trim();
  return value;
}

export const configReady = config => Boolean(configOf(config).cwd);

// Saving changes future turns, not the frozen configuration of an active turn.
export async function saveSettings(save, draft) {
  const config = configOf(draft);
  if (!configReady(config)) throw new Error('Enter a working folder before saving.');
  await save(config);
}

const FALLBACK_INSTRUCTIONS = 'Publication rule for this harness: your final nonempty message WILL be posted to the conversation as your reply; write it for that audience, and leave it empty for intentional silence on a non-mention wake.';

export function createRuntime(ctx, source) {
  const kit = ctx.agents.harness;
  const store = new SessionStore(ctx.agents.storage);
  const lanes = new SessionLanes();
  const active = new Set();
  const retiring = new Map();
  let disposed = false;

  function cancel(operation, reason) {
    if (operation.controller.signal.aborted) return;
    operation.reason = reason;
    operation.controller.abort(reason === 'deadline'
      ? new Error('Muse turn exceeded its run deadline, including time waiting for this conversation. Please try again.')
      : abortError());
  }

  async function perform(delivery, conversation, operation) {
    const signal = operation.controller.signal;
    const config = configOf(delivery.config);
    const key = sessionKey(delivery.agent, conversation);
    let prompt;
    let started = false;
    const current = () => {
      if (disposed || !delivery.current()) cancel(operation, 'lifetime');
      signal.throwIfAborted();
    };
    try {
      current();
      if (!ctx.host.resolveDirectory) throw new Error('This harness requires Buzz desktop file access. Review the plugin host grants.');
      if (!config.cwd) throw new Error('Enter a working folder in this agent’s Settings.');
      if (!['default', 'acceptEdits'].includes(config.permissionMode)) throw new Error('Unsupported permissions setting. Select Default or Accept edits in this agent’s Settings.');
      const cwd = await ctx.host.resolveDirectory(config.cwd, { create: config.cwd === defaults().cwd });
      current();
      const instructions = [config.instructions, FALLBACK_INSTRUCTIONS].filter(Boolean).join('\n\n');
      // muse-acp 0.1.x cannot accept Buzz MCP servers, so the session prompt
      // is built without Buzz tool guidance; replies arrive as final text.
      const systemPrompt = await kit.systemPrompt(delivery, { scope: config.scope, cwd, instructions, tools: false });
      current();
      // Adapter path and conversation location define the session; permission
      // and instruction changes are per-turn and never move a session.
      const fingerprint = JSON.stringify([cwd, config.adapter, config.scope]);
      const previous = await store.get(key, fingerprint);
      current();
      prompt = await kit.turnPrompt(delivery, conversation, previous ? { cursor: previous.cursor } : {});
      current();
      await store.put(key, { id: previous?.id || 'pending', cursor: prompt.cursor, fingerprint, inFlight: true, at: Date.now() });
      current();
      const postedTexts = new Set();
      const output = new TurnOutput(tool => delivery.step?.(tool));
      const code = await bridgeRequest(ctx.host, source, {
        action: 'run', adapter: config.adapter || undefined,
        prompt: prompt.text, systemPrompt,
        sessionId: previous?.id, resume: Boolean(previous),
        permissionMode: config.permissionMode, cwd,
      }, { signal, onEvent: event => {
        if (event.type === 'bridge_started') started = true;
        output.accept(event);
      } });
      current();
      const result = output.finish(code);
      if (!result.sessionId) throw new Error('Muse returned no session identity. The saved association has been cleared to prevent mixing conversations.');
      const answer = finalReply(result.text, postedTexts);
      if (answer) { current(); await kit.reply(delivery.agent, conversation, answer); }
      if (result.denials.length) {
        current();
        await kit.reply(delivery.agent, conversation,
          `Muse permission denied: ${result.denials.join(', ')}. This headless harness cannot answer interactive approvals. Review the requested action and the agent's permission setting; no permission bypass is enabled.`,
          { notifyOwner: true });
      } else if (!postedTexts.size && !result.text?.trim() && delivery.trigger.type === 'mention') {
        throw new Error('Muse finished without a reply. Ask again with a specific request.');
      }
      current();
      await store.put(key, { id: result.sessionId, cursor: prompt.cursor, fingerprint, at: Date.now() });
    } catch (error) {
      if (!started) prompt?.restore();
      await store.remove(key);
      throw error;
    }
  }

  function run(delivery) {
    if (retiring.has(delivery.agent.key) || disposed) {
      delivery.ignored?.();
      return;
    }
    const operation = { controller: new AbortController(), agentKey: delivery.agent.key };
    active.add(operation);
    const abort = () => cancel(operation, delivery.current() ? 'deadline' : 'lifetime');
    delivery.signal.addEventListener('abort', abort, { once: true });
    if (delivery.signal.aborted) abort();
    let conversation;
    const done = (async () => {
      conversation = await kit.conversation(delivery, configOf(delivery.config).scope);
      if (!conversation) { delivery.ignored?.(); return { ok: true }; }
      delivery.acknowledged?.();
      delivery.interruptible?.(async () => { cancel(operation, 'owner-stop'); await operation.done; });
      await lanes.run(sessionKey(delivery.agent, conversation), operation.controller.signal,
        () => perform(delivery, conversation, operation));
      return { ok: true };
    })().catch(async error => {
      if (operation.reason === 'owner-stop') return { ok: true, stopped: true };
      if (operation.reason && operation.reason !== 'deadline') {
        return { ok: false, error: operation.reason === 'reset' ? 'Saved conversations were reset.' : 'The agent is no longer active.' };
      }
      const message = safeMessage(operation.reason === 'deadline' ? operation.controller.signal.reason : error);
      if (conversation && !disposed && delivery.current()) {
        try { await kit.reply(delivery.agent, conversation, `Muse subscription: ${message}`, { notifyOwner: true }); }
        catch (replyError) { return { ok: false, error: `${message} The error reply also failed: ${safeMessage(replyError)}` }; }
      }
      return { ok: false, error: message };
    }).finally(() => {
      delivery.signal.removeEventListener('abort', abort);
      active.delete(operation);
    });
    operation.done = done;
    delivery.workingUntil(done);
  }

  function retire(key) {
    if (retiring.has(key)) return retiring.get(key);
    // Close admission synchronously, before awaiting active work or storage.
    const done = Promise.resolve().then(async () => {
      const pending = [...active].filter(operation => operation.agentKey === key);
      for (const operation of pending) cancel(operation, 'reset');
      await Promise.all(pending.map(operation => operation.done));
      await store.clear(key);
    }).finally(() => retiring.delete(key));
    retiring.set(key, done);
    return done;
  }

  return {
    run, retire,
    prune: snapshot => store.prune(snapshot),
    dispose() {
      disposed = true;
      for (const operation of active) cancel(operation, 'lifetime');
    },
  };
}
