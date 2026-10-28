/**
 * Anysee intel platform: one engine per server process, mounted at
 * /api/intel on the development and preview servers.
 */

import { fileURLToPath } from 'node:url';
import { createIntelApi } from './api.js';
import { createIntelEngine } from './engine.js';

const DATA_DIR = fileURLToPath(
  new URL('../../.gev-cache/intel/', import.meta.url),
);

// Vite re-imports its config, and this module, when either changes. One
// engine runs per process: a reload from changed code stops the previous
// engine (which saves its state) and starts the new one from that state.
// State is otherwise saved on a short debounce, so no exit hook is needed.
const KEY = Symbol.for('anysee.intel.engine');
const MODULE_INSTANCE = Symbol('anysee.intel.module');

/** The process-wide engine, started on first use. */
export function intelEngine() {
  const current = globalThis[KEY];
  if (current?.instance === MODULE_INSTANCE) return current.engine;
  const engine = createIntelEngine({
    dataDir: process.env.ANYSEE_DATA_DIR || DATA_DIR,
  });
  globalThis[KEY] = { instance: MODULE_INSTANCE, engine };
  Promise.resolve(current?.engine.stop())
    .then(() => engine.start())
    .catch((error) => console.error('[intel] engine failed to start:', error));
  return engine;
}

export function intelPlatform() {
  const install = (server) => {
    if (process.env.ANYSEE_INTEL === 'off') return;
    server.middlewares.use('/api/intel', createIntelApi(intelEngine()));
  };
  return {
    name: 'anysee-intel',
    configureServer: install,
    configurePreviewServer: install,
  };
}
