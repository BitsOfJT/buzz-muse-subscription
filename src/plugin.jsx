import bridgeSource from './bridge-cli.mjs?source';
import { configOf, createRuntime, defaults } from './runtime.mjs';
import { createSetup } from './setup.mjs';
import { createUI } from './ui.jsx';

export const inject = ['react', 'agents', 'settingsCards', 'host'];

export function apply(ctx) {
  if (!ctx.agents.harness || !ctx.agents.storage) {
    throw new Error('Muse subscription requires Buzz 1.0.2 with the external harness kit and agent storage.');
  }
  const runtime = createRuntime(ctx, bridgeSource);
  const setup = createSetup(ctx.host, bridgeSource);
  const { Connection, Create, Settings } = createUI(ctx.react, setup, runtime);
  ctx.settingsCards.register({
    id: 'subscription', title: 'Muse (subscription)', personal: true, component: Connection,
  });
  ctx.agents.register({
    id: 'muse-subscription', title: 'Muse (subscription)',
    description: 'Your Muse subscription through the genuine Muse client — no API key.',
    defaults: () => ({ config: defaults() }),
    summary: () => 'Muse · subscription',
    CreateConfiguration: Create,
    tabs: [{ id: 'settings', title: 'Settings', role: 'settings', component: Settings }],
    provider: {
      snapshot: () => setup.snapshot().connection,
      subscribe: setup.subscribe, check: setup.refresh, DialogBody: Connection,
    },
    // muse-acp 0.1.x exposes no per-session model choice; the Muse client
    // uses its own configured default. One honest entry, not a fake picker.
    models: () => ({
      current: 'default',
      models: [{ id: 'default', label: 'Muse default model', efforts: [] }],
    }),
    protectionUnavailable: 'Standard Muse tool permissions only; this harness does not implement Buzz protection or OS sandboxing.',
    retire: runtime.retire, timeoutMs: 30 * 60 * 1000, run: runtime.run,
  });
  ctx.effect(() => {
    void setup.check();
    const prune = () => {
      void runtime.prune(ctx.agents.snapshot?.()).catch(() => {
        // Storage cleanup is opportunistic; a failed deletion is retried on
        // the next membership notification, without disrupting active turns.
      });
    };
    const unsubscribe = ctx.agents.subscribe?.(prune);
    prune();
    return () => {
      unsubscribe?.();
      runtime.dispose();
      setup.dispose();
    };
  });
}
