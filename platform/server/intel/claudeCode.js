/**
 * Claude Code as a brief writer. When the person running Anysee has Claude
 * Code installed and signed in, briefs run through headless `claude -p` on
 * their own login, so no API key is needed. This module also drives
 * `claude auth login` so the dashboard can start a sign-in.
 *
 * Everything here runs on the machine that serves Anysee, as that user; the
 * API routes that reach it accept loopback requests only.
 */

import { execFile, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = process.env.ANYSEE_CLAUDE_PATH || 'claude';
const STATUS_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 6 * 60_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
// A neutral working directory, so no project CLAUDE.md or settings apply.
const WORK_DIR = join(tmpdir(), 'anysee-claude');

/** The child's environment: the subscription login, never a stray API key. */
function childEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function run(args, timeout = STATUS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(
      CLI,
      args,
      { timeout, env: childEnv(), maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else resolve(stdout);
      },
    );
  });
}

/** Whether Claude Code is installed and signed in, and as whom. */
export async function claudeCodeStatus() {
  let version;
  try {
    version = (await run(['--version'])).trim().split(/\s+/)[0];
  } catch (error) {
    return {
      installed: false,
      loggedIn: false,
      reason:
        error.code === 'ENOENT'
          ? 'Claude Code is not installed'
          : `Claude Code did not start: ${error.message}`,
    };
  }
  try {
    const status = JSON.parse(await run(['auth', 'status', '--json']));
    return {
      installed: true,
      version,
      loggedIn: Boolean(status.loggedIn),
      authMethod: status.authMethod ?? null,
      email: status.email ?? null,
      subscriptionType: status.subscriptionType ?? null,
      reason: status.loggedIn ? null : 'Claude Code is not signed in',
    };
  } catch (error) {
    // Older CLIs exit non-zero when signed out but still print JSON.
    try {
      const status = JSON.parse(error.stdout ?? '');
      return {
        installed: true,
        version,
        loggedIn: Boolean(status.loggedIn),
        reason: 'Claude Code is not signed in',
      };
    } catch {
      return {
        installed: true,
        version,
        loggedIn: false,
        reason: 'Could not read Claude Code sign-in status',
      };
    }
  }
}

/**
 * Run one headless Claude Code turn with no tools and no saved session, and
 * return its structured output for `schema`.
 */
export async function runClaudeCode({
  prompt,
  system,
  schema,
  model,
  effort,
  signal,
}) {
  await mkdir(WORK_DIR, { recursive: true });
  const args = [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--system-prompt',
    system,
    '--tools',
    '',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    ...(model ? ['--model', model] : []),
    ...(effort ? ['--effort', effort] : []),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, args, {
      cwd: WORK_DIR,
      env: childEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = [];
    let size = 0;
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), RUN_TIMEOUT_MS);
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES) child.kill('SIGTERM');
      else out.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        error.code === 'ENOENT'
          ? new Error('Claude Code is not installed')
          : error,
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      const text = Buffer.concat(out).toString('utf8');
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        const detail =
          (stderr || text).trim().split('\n').at(-1) || `exit code ${code}`;
        reject(new Error(`Claude Code failed: ${detail.slice(0, 200)}`));
        return;
      }
      if (body.is_error || body.subtype !== 'success') {
        reject(
          new Error(
            `Claude Code: ${String(body.result ?? body.subtype ?? 'error').slice(0, 200)}`,
          ),
        );
        return;
      }
      const output = body.structured_output ?? safeParse(body.result);
      if (!output) {
        reject(new Error('Claude Code returned no structured output'));
        return;
      }
      // The model that wrote the most output wrote the answer.
      const model = Object.entries(body.modelUsage ?? {}).sort(
        (a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0),
      )[0]?.[0];
      resolve({
        output,
        model: model ?? 'claude-code',
        usage: {
          input: body.usage?.input_tokens ?? 0,
          output: body.usage?.output_tokens ?? 0,
        },
      });
    });
    child.stdin.end(prompt);
  });
}

/** Only Anthropic sign-in pages are passed to the browser. */
function isSignInUrl(candidate) {
  try {
    const { host } = new URL(candidate);
    return (
      host === 'claude.ai' ||
      host.endsWith('.claude.ai') ||
      host === 'anthropic.com' ||
      host.endsWith('.anthropic.com') ||
      host === 'claude.com' ||
      host.endsWith('.claude.com')
    );
  } catch {
    return false;
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/*
 * Sign-in. `claude auth login` opens the browser on this machine and waits
 * for the redirect. If the browser can't open, it prints a URL; if the
 * redirect can't reach it, it asks for the code shown after signing in,
 * which submitLoginCode passes on.
 */
let login = null;

function loginView() {
  if (!login) return { state: 'idle' };
  const { state, url, message, startedAt } = login;
  return { state, url, message, startedAt };
}

export function claudeLoginState() {
  return loginView();
}

export function startClaudeLogin({ onDone } = {}) {
  if (login?.state === 'running') return loginView();
  const child = spawn(CLI, ['auth', 'login', '--claudeai'], {
    env: childEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  login = {
    state: 'running',
    url: null,
    message: 'Waiting for you to finish signing in in the browser…',
    startedAt: Date.now(),
    child,
    output: '',
  };
  const current = login;
  const timer = setTimeout(() => child.kill('SIGTERM'), LOGIN_TIMEOUT_MS);
  const read = (chunk) => {
    current.output = (current.output + chunk).slice(-4000);
    const url = current.output
      .match(/https:\/\/[^\s"'<>]+/g)
      ?.find(isSignInUrl);
    if (url) current.url = url;
    if (/code/i.test(String(chunk)) && /paste|enter/i.test(String(chunk))) {
      current.message =
        'Paste the code shown in the browser after you sign in.';
      current.needsCode = true;
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('error', (error) => {
    clearTimeout(timer);
    current.state = 'failed';
    current.message =
      error.code === 'ENOENT' ? 'Claude Code is not installed' : error.message;
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (current.state !== 'running') return;
    current.state = code === 0 ? 'done' : 'failed';
    current.message =
      code === 0
        ? 'Signed in.'
        : `Sign-in did not finish (${current.output.trim().split('\n').at(-1)?.slice(0, 160) || `exit ${code}`}). You can also run \`claude auth login\` in a terminal.`;
    onDone?.(current.state);
  });
  return loginView();
}

export function submitClaudeLoginCode(code) {
  if (login?.state !== 'running')
    return { ...loginView(), error: 'No sign-in is waiting for a code' };
  const clean = String(code ?? '').trim();
  if (!clean || clean.length > 2000 || /[\r\n]/.test(clean))
    return { ...loginView(), error: 'That does not look like a sign-in code' };
  login.child.stdin.write(`${clean}\n`);
  login.message = 'Code sent. Finishing sign-in…';
  return loginView();
}

export function cancelClaudeLogin() {
  if (login?.state === 'running') {
    login.state = 'cancelled';
    login.message = 'Sign-in cancelled.';
    login.child.kill('SIGTERM');
  }
  return loginView();
}
