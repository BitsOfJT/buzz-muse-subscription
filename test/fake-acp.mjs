// A minimal fake ACP agent for bridge tests. Speaks just enough of the
// protocol over stdio: initialize, session/new, session/load, session/prompt,
// and one session/request_permission round-trip whose outcome is echoed back
// into the message text so tests can see what the bridge decided.
// Set FAKE_ACP_FAIL_LOAD=1 to make session/load fail (resume fallback test).
// Set FAKE_ACP_REPLAY=1 to replay old history during session/load, as the
// ACP spec requires of a real agent (regression test for reply pollution).
// Set FAKE_ACP_NONEDIT=1 to ask permission for a non-edit tool instead.
// Set FAKE_ACP_ALLOW_ALWAYS_ONLY=1 to offer allow_always but no allow_once.
// Set FAKE_ACP_MAX_TOKENS=1 to end the prompt with stopReason max_tokens.
import { StringDecoder } from 'node:string_decoder';

const decoder = new StringDecoder('utf8');
let buffer = '';
let permissionReply = null;

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
function update(sessionId, updateBody) {
  send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: updateBody } });
}
function chunk(sessionId, text) {
  update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
}

async function handlePrompt(id, params) {
  const sessionId = params.sessionId;
  const tool = process.env.FAKE_ACP_NONEDIT
    ? { toolCallId: 't1', title: 'Run command', kind: 'execute', status: 'pending' }
    : { toolCallId: 't1', title: 'Edit file', kind: 'edit', status: 'pending' };
  const options = process.env.FAKE_ACP_ALLOW_ALWAYS_ONLY
    ? [
        { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
        { optionId: 'reject-1', name: 'Reject once', kind: 'reject_once' },
      ]
    : [
        { optionId: 'allow-1', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject-1', name: 'Reject once', kind: 'reject_once' },
      ];
  chunk(sessionId, 'Hello ');
  update(sessionId, { sessionUpdate: 'tool_call', ...tool });
  const reply = await new Promise((resolve) => {
    permissionReply = resolve;
    send({
      jsonrpc: '2.0', id: 'srv-1', method: 'session/request_permission',
      params: { sessionId, toolCall: { ...tool }, options },
    });
  });
  const inner = reply?.outcome ?? {};
  const label = inner.outcome === 'selected' ? inner.optionId : inner.outcome || 'none';
  chunk(sessionId, `world perm=${label}`);
  send({ jsonrpc: '2.0', id, result: { stopReason: process.env.FAKE_ACP_MAX_TOKENS ? 'max_tokens' : 'end_turn' } });
}

process.stdin.on('data', (data) => {
  buffer += decoder.write(data);
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id === 'srv-1' && (message.result !== undefined || message.error !== undefined)) {
      permissionReply?.(message.result ?? { outcome: 'cancelled' });
      permissionReply = null;
      continue;
    }
    if (message.method === 'initialize') {
      send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, agentInfo: { name: 'fake-acp', version: '9.9.9' } } });
    } else if (message.method === 'session/new') {
      send({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'fake-session-1' } });
    } else if (message.method === 'session/load') {
      if (process.env.FAKE_ACP_FAIL_LOAD) send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'no such session' } });
      else {
        if (process.env.FAKE_ACP_REPLAY) {
          chunk(message.params.sessionId, 'OLD HISTORY ');
          update(message.params.sessionId, { sessionUpdate: 'tool_call', toolCallId: 'old-1', title: 'Old edit', kind: 'edit', status: 'completed' });
        }
        send({ jsonrpc: '2.0', id: message.id, result: {} });
      }
    } else if (message.method === 'session/prompt') {
      void handlePrompt(message.id, message.params);
    } else if (message.method && message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
