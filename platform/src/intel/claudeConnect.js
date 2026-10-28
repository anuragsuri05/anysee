/**
 * "Connect Claude": signs Anysee in through the Claude Code login on this
 * computer, so briefs are written by Claude on the user's own account with
 * no API key. Shows who is connected, or walks through installing Claude
 * Code and signing in.
 */

import { h, replace, link, utc } from './dom.js';

const POLL_MS = 2_000;
const INSTALL_COMMAND = 'npm install -g @anthropic-ai/claude-code';

function copyable(command) {
  const button = h(
    'button',
    {
      class: 'ax-btn',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(command);
          button.textContent = 'Copied';
        } catch {
          button.textContent = 'Select and copy';
        }
      },
    },
    'Copy',
  );
  return h('div', { class: 'ax-command' }, h('code', {}, command), button);
}

const everyText = (minutes = 120) =>
  minutes % 60 === 0
    ? minutes === 60
      ? 'hour'
      : `${minutes / 60} hours`
    : `${minutes} minutes`;

const PLAN_LABEL = {
  max: 'Max plan',
  pro: 'Pro plan',
  team: 'Team plan',
  enterprise: 'Enterprise plan',
};

export function createClaudeConnect({ api, onConnected }) {
  let view = null;
  let poll = null;
  let open = false;
  const listeners = new Set();
  const body = h('div', { class: 'ax-connect-body' });
  const root = h(
    'div',
    {
      class: 'ax-root ax-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Connect Claude',
      onclick: (event) => event.target === root && close(),
    },
    h(
      'div',
      { class: 'ax-modal-card' },
      h(
        'header',
        { class: 'ax-drawer-head' },
        h('span', {}, 'Connect Claude'),
        h(
          'button',
          { class: 'ax-close', 'aria-label': 'Close', onclick: () => close() },
          '×',
        ),
      ),
      body,
    ),
  );
  document.body.append(root);

  function publish() {
    for (const listener of listeners) listener(view);
  }

  async function load() {
    try {
      const previous = view?.connected;
      view = await api.claude();
      if (view.connected && previous === false) onConnected?.(view);
    } catch (error) {
      view = { error: error.message };
    }
    publish();
    if (open) draw();
    const waiting = view?.login?.state === 'running';
    clearTimeout(poll);
    if (waiting) poll = setTimeout(load, POLL_MS);
  }

  async function act(call) {
    try {
      view = await call();
    } catch (error) {
      view = { ...view, actionError: error.message };
    }
    publish();
    draw();
    clearTimeout(poll);
    if (view?.login?.state === 'running') poll = setTimeout(load, POLL_MS);
  }

  function draw() {
    if (!view) {
      replace(body, h('p', {}, 'Checking for Claude…'));
      return;
    }
    if (view.error) {
      replace(
        body,
        h('p', {}, `Could not reach the intel engine: ${view.error}`),
      );
      return;
    }
    const cc = view.claudeCode;
    const login = view.login ?? { state: 'idle' };
    const parts = [];

    if (view.connected && view.provider === 'claude-code') {
      parts.push(
        h('div', { class: 'ax-connect-status ok' }, 'Connected'),
        h('h2', {}, cc?.email ?? 'Your Claude account'),
        h(
          'p',
          {},
          `${PLAN_LABEL[cc?.plan] ?? 'Claude account'} · via Claude Code ${cc?.version ?? ''}`,
        ),
        h(
          'p',
          { class: 'ax-muted' },
          `Briefs are written by Claude on this account every ${everyText(view.briefEveryMin)} and whenever you press Regenerate. They count toward your Claude usage.`,
        ),
        h(
          'div',
          { class: 'ax-actions' },
          h(
            'button',
            {
              class: 'ax-btn primary',
              onclick: async (event) => {
                event.currentTarget.disabled = true;
                event.currentTarget.textContent = 'Writing…';
                await api.regenerateBrief().catch(() => {});
                close();
                onConnected?.(view);
              },
            },
            'Write a brief now',
          ),
          h(
            'button',
            { class: 'ax-btn', onclick: () => act(api.claudeRefresh) },
            'Re-check',
          ),
        ),
        h(
          'p',
          { class: 'ax-note' },
          'To use a different account, run `claude auth logout` in a terminal, then connect again.',
        ),
      );
    } else if (view.connected && view.provider === 'api') {
      parts.push(
        h('div', { class: 'ax-connect-status ok' }, 'Connected'),
        h('h2', {}, 'Anthropic API key'),
        h(
          'p',
          { class: 'ax-muted' },
          `Briefs use ANTHROPIC_API_KEY from .env (${view.model}). Remove the key, or set ANYSEE_BRIEF_PROVIDER=claude-code, to use your Claude Code login instead.`,
        ),
      );
    } else if (cc && !cc.installed) {
      parts.push(
        h('div', { class: 'ax-connect-status' }, 'Step 1 of 2'),
        h('h2', {}, 'Install Claude Code'),
        h(
          'p',
          { class: 'ax-muted' },
          'Anysee uses the Claude Code login on this computer, so there is no API key to manage. Install it once in a terminal:',
        ),
        copyable(INSTALL_COMMAND),
        h(
          'div',
          { class: 'ax-actions' },
          h(
            'button',
            { class: 'ax-btn primary', onclick: () => act(api.claudeRefresh) },
            'I installed it',
          ),
        ),
      );
    } else if (login.state === 'running') {
      parts.push(
        h('div', { class: 'ax-connect-status' }, 'Signing in'),
        h('h2', {}, 'Finish signing in in your browser'),
        h('p', { class: 'ax-muted' }, login.message),
        login.url
          ? h(
              'p',
              {},
              'No browser tab? ',
              link(login.url, 'Open the Claude sign-in page ↗'),
            )
          : null,
        codeForm(),
        h(
          'div',
          { class: 'ax-actions' },
          h(
            'button',
            { class: 'ax-btn', onclick: () => act(api.claudeLoginCancel) },
            'Cancel',
          ),
        ),
      );
    } else {
      const failed = login.state === 'failed';
      parts.push(
        h(
          'div',
          { class: 'ax-connect-status' },
          cc?.installed ? 'One step' : 'Checking',
        ),
        h('h2', {}, 'Sign in with your Claude account'),
        h(
          'p',
          { class: 'ax-muted' },
          'Anysee signs in through Claude Code on this computer. A browser tab opens for you to approve; Claude then writes your briefs on your own plan.',
        ),
        failed ? h('p', { class: 'ax-note warn' }, login.message) : null,
        view.actionError
          ? h('p', { class: 'ax-note warn' }, view.actionError)
          : null,
        h(
          'div',
          { class: 'ax-actions' },
          h(
            'button',
            { class: 'ax-btn primary', onclick: () => act(api.claudeLogin) },
            failed ? 'Try again' : 'Sign in with Claude',
          ),
          h(
            'button',
            { class: 'ax-btn', onclick: () => act(api.claudeRefresh) },
            'I already signed in',
          ),
        ),
        h(
          'p',
          { class: 'ax-note' },
          'Prefer the terminal? Run this, then press "I already signed in":',
        ),
        copyable('claude auth login'),
      );
    }
    if (view.lastBrief?.error)
      parts.push(
        h(
          'p',
          { class: 'ax-note warn' },
          `Last brief failed: ${view.lastBrief.error}`,
        ),
      );
    else if (view.lastBrief?.via)
      parts.push(
        h(
          'p',
          { class: 'ax-note' },
          `Last brief: ${utc(view.lastBrief.generatedAt)} by ${view.lastBrief.generator} via ${view.lastBrief.via}`,
        ),
      );
    replace(body, parts);
  }

  function codeForm() {
    const input = h('input', {
      class: 'ax-input',
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Paste the code from the browser',
      style: { flex: 1 },
    });
    return h(
      'form',
      {
        class: 'ax-command',
        onsubmit: (event) => {
          event.preventDefault();
          if (input.value.trim())
            act(() => api.claudeLoginCode(input.value.trim()));
        },
      },
      input,
      h('button', { class: 'ax-btn', type: 'submit' }, 'Submit code'),
    );
  }

  function close() {
    open = false;
    root.classList.remove('open');
  }

  load();

  return {
    open() {
      open = true;
      root.classList.add('open');
      draw();
      load();
    },
    close,
    get isOpen() {
      return open;
    },
    get view() {
      return view;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (view) listener(view);
      return () => listeners.delete(listener);
    },
    refresh: load,
  };
}
