import { configOf, configReady, defaults, MODELS, saveSettings } from './runtime.mjs';
import { safeMessage } from './session.mjs';

export function createUI(React, setup, runtime) {
  function Form({ children }) {
    return <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      <style>{`
        .bitsofjt-muse-control {
          box-sizing: border-box; min-width: 0; padding: 9px 11px;
          border: 1px solid color-mix(in srgb,currentColor 25%,transparent);
          border-radius: 9px; background: color-mix(in srgb,currentColor 5%,transparent);
          color: inherit; font: inherit;
        }
        :is(input,textarea,select).bitsofjt-muse-control { display: block; width: 100%; margin-top: 6px; }
        button.bitsofjt-muse-control { cursor: pointer; }
        .bitsofjt-muse-control:disabled { opacity: .5; cursor: not-allowed; }
        .bitsofjt-muse-control:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
        .bitsofjt-muse-copy { font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
      `}</style>
      {children}
    </div>;
  }
  const Button = props => <button className="bitsofjt-muse-control" {...props} />;
  const Copy = props => <p className="bitsofjt-muse-copy" {...props} />;

  function Connection() {
    const { connection, status, error } = React.useSyncExternalStore(setup.subscribe, setup.snapshot);
    const [message, setMessage] = React.useState('');
    React.useEffect(() => { void setup.check(); }, []);
    async function recheck() {
      setMessage('');
      await setup.refresh();
      setMessage('Status refreshed. This check spends no model request; the subscription itself is verified on the first turn.');
    }
    return <Form>
      <section className="ui-card" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <h2>Muse (subscription)</h2>
        <Copy>Uses your Muse subscription through the genuine Muse client — not a pay-as-you-go Model API key, and not Buzz's built-in harnesses.</Copy>
        <dl style={{ overflowWrap: 'anywhere' }}>
          <dt>muse-acp adapter</dt><dd>{status?.adapter || 'Not detected'}</dd>
          <dt>Adapter version</dt><dd>{status?.adapterVersion || 'Not detected'}</dd>
          <dt>Muse client</dt><dd>{status?.muse || 'Not detected on PATH'}</dd>
          <dt>Muse version</dt><dd>{status?.museVersion || 'Not detected'}</dd>
          <dt>Engine handshake</dt>
          <dd>{status ? (status.engineReady ? 'Answered' : 'Not answering') : 'Unknown'}</dd>
          <dt>Subscription sign-in</dt>
          <dd>Managed by Muse itself — this plugin never sees or stores your credentials</dd>
        </dl>
        <Copy role={error ? 'alert' : 'status'}>{error || connection.attentionDescription}</Copy>
        <div>
          <Button disabled={connection.readiness === 'checking'} onClick={() => void recheck()}>
            Check status
          </Button>
        </div>
        {message && <Copy role="status">{message}</Copy>}
        <Copy>
          Setup on the computer that runs the agent: install Node.js 20+, install Muse and sign in once
          with <code>muse login</code> in a terminal, install the adapter with <code>npm install -g muse-acp</code>,
          then restart Buzz so the desktop app picks up the new PATH entries.
        </Copy>
        <Copy>
          Current limits of the adapter (muse-acp 0.1.x): Buzz's own MCP tools cannot be handed to the agent yet,
          so the agent replies with its final message instead of posting through Buzz tools; the model is chosen
          per agent in the agent settings and applied when the Muse engine host starts. Agent instructions are
          delivered as a preamble on the first turn of each new conversation.
        </Copy>
        <Copy>
          Muse's tool permissions are not an OS sandbox. This trusted plugin, Muse and approved tools
          can access this account's files and network. No Buzz protection or permission bypass is enabled.
        </Copy>
      </section>
    </Form>;
  }

  function Fields({ config, onChange, disabled, onAdapterBlur }) {
    // Preserve the editable draft; trimming happens at readiness/save/run boundaries.
    const value = { ...defaults(), ...config };
    const field = (name, next) => onChange({ ...value, [name]: next });
    return <Form>
      <fieldset disabled={disabled} style={{ display: 'grid', gap: 16 }}>
        <label>Model
          <select className="bitsofjt-muse-control" value={value.model} onChange={event => field('model', event.target.value)}>
            {MODELS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>
        <Copy>
          Per agent, applying to turns run after the change; switching keeps the conversation.
          Muse default follows the Muse client's own model setting on the host — currently Wonder
          unless you changed it there. The named models pin this agent to that model instead.
        </Copy>
        <label>Working folder
          <input className="bitsofjt-muse-control" value={value.cwd} onChange={event => field('cwd', event.target.value)} />
        </label>
        <Copy>
          Use an absolute path or ~/… on the system running Buzz. The default folder is created automatically;
          a custom folder must exist. This is a working directory, not filesystem containment.
        </Copy>
        <label>muse-acp executable (optional)
          <input className="bitsofjt-muse-control" value={value.adapter}
            placeholder="Auto-detect, or absolute path to muse-acp"
            onChange={event => field('adapter', event.target.value)} onBlur={onAdapterBlur} />
        </label>
        <label>Permissions
          <select className="bitsofjt-muse-control" value={value.permissionMode} onChange={event => field('permissionMode', event.target.value)}>
            <option value="default">Default — deny actions that need interactive approval, and report them</option>
            <option value="acceptEdits">Accept edits — automatically approve file edits only</option>
          </select>
        </label>
        <Copy>
          This harness has no interactive approval prompt. In Default mode, tool actions that ask for
          permission are refused and reported to you. Accept edits approves file-edit requests only —
          never shell commands or other tools. Neither mode is an OS sandbox.
        </Copy>
        <label>Conversation sessions
          <select className="bitsofjt-muse-control" value={value.scope} onChange={event => field('scope', event.target.value)}>
            <option value="thread">One per thread (DMs and Solo chats stay whole)</option>
            <option value="channel">One per channel</option>
          </select>
        </label>
        <label>Agent instructions
          <textarea className="bitsofjt-muse-control" value={value.instructions} rows={6}
            onChange={event => field('instructions', event.target.value)} />
        </label>
        <Copy>Never include credentials in agent instructions.</Copy>
      </fieldset>
    </Form>;
  }

  function Create(props) {
    const { revision, connection } = React.useSyncExternalStore(setup.subscribe, setup.snapshot);
    const [adapter, setAdapter] = React.useState(() => configOf(props.config).adapter);
    const [checked, setChecked] = React.useState();
    const [problem, setProblem] = React.useState('');
    React.useEffect(() => {
      let active = true;
      setChecked(undefined);
      setProblem('');
      void setup.inspect(adapter).then(value => {
        if (!active) return;
        setChecked({ adapter, revision, ready: Boolean(value.adapter && value.engineReady && !value.error) });
        setProblem(value.error ? safeMessage(value.error) : '');
      }, error => { if (active) setProblem(safeMessage(error)); });
      return () => { active = false; };
    }, [adapter, revision]);
    const ready = Boolean(checked?.ready && checked.adapter === configOf(props.config).adapter
      && checked.revision === revision && configReady(props.config));
    React.useEffect(() => { props.onReadyChange?.(ready); }, [ready, props.onReadyChange]);
    return <Form>
      {props.harnessControl}
      <details>
        <summary className="bitsofjt-muse-control">Muse setup</summary>
        <Connection />
      </details>
      <Fields {...props} onAdapterBlur={() => setAdapter(configOf(props.config).adapter)} />
      <Copy role={problem ? 'alert' : 'status'}>
        {problem || (ready ? 'Muse setup is ready.'
          : 'Enter a working folder, then leave the adapter field to check it. Open Muse setup if anything is missing.')}
      </Copy>
    </Form>;
  }

  function Settings({ agent, save, settingsHost, settingsContent }) {
    const [draft, setDraft] = React.useState(() => configOf(agent.config));
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [confirmReset, setConfirmReset] = React.useState(false);
    async function commit() {
      setBusy(true);
      setMessage('');
      try {
        await saveSettings(save, draft);
        setMessage('Settings saved for future turns. Active turns continue; model, instruction and permission changes preserve conversations.');
      } catch (error) { setMessage(safeMessage(error)); }
      finally { setBusy(false); }
    }
    async function reset() {
      setBusy(true);
      setMessage('');
      try {
        await runtime.retire(agent.key);
        setConfirmReset(false);
        setMessage('Saved conversation associations cleared. Muse transcript files are not deleted.');
      } catch (error) { setMessage(safeMessage(error)); }
      finally { setBusy(false); }
    }
    return <Form>
      {settingsContent}
      {settingsHost?.typeControl?.(JSON.stringify(draft) !== JSON.stringify(configOf(agent.config)))}
      <Fields config={draft} onChange={setDraft} disabled={busy} />
      <Button disabled={busy || !configReady(draft)} onClick={() => void commit()}>Save settings</Button>
      <Button disabled={busy} onClick={() => setConfirmReset(true)}>Reset saved conversations…</Button>
      {confirmReset && <div role="alert">
        <Copy>
          Stop this agent's active turns and forget its session associations? New arrivals are ignored during
          reset. The next turn receives Buzz conversation history; previous tool actions are not undone.
        </Copy>
        <Button disabled={busy} onClick={() => void reset()}>Confirm reset</Button>{' '}
        <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
      </div>}
      {message && <Copy role="status">{message}</Copy>}
    </Form>;
  }
  return { Connection, Create, Settings };
}
