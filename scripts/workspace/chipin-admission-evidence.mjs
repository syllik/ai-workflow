// Trusted-artifact transport only. The canonical consumer/verifier is loaded
// from the authenticated immutable ChipIn-one/.github commit by the runner.
import { execFile as callback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { userInfo } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(callback);
const ROOT = '/repos/ChipIn-one/.github';
const MAX_ZIP = 2 * 1024 * 1024;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{15,127}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const REPLAY_COMPONENTS = ['.local', 'state', 'ai-workflow', 'admission-replay'];

/** Stable per-OS-principal state; never a CLI flag, HOME or task-provided path. */
export function canonicalReplayDirectory() {
  return path.join(userInfo().homedir, ...REPLAY_COMPONENTS);
}

async function openTrustedRegistry() {
  let directory;
  try { directory = await realpath(userInfo().homedir); }
  catch { throw blocked('REPLAY_REGISTRY_UNAVAILABLE'); }
  for (const [index, name] of REPLAY_COMPONENTS.entries()) {
    directory = path.join(directory, name);
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (cause) {
      if (cause?.code !== 'EEXIST') throw blocked('REPLAY_REGISTRY_UNAVAILABLE');
    }
    let meta;
    try { meta = await lstat(directory); }
    catch { throw blocked('REPLAY_REGISTRY_UNAVAILABLE'); }
    if (!meta.isDirectory() || meta.isSymbolicLink() ||
        (meta.mode & (index >= 2 ? 0o077 : 0o022)) !== 0 ||
        (process.getuid && meta.uid !== process.getuid())) {
      throw blocked('REPLAY_REGISTRY_UNTRUSTED');
    }
  }
  return directory;
}

function blocked(code) {
  return Object.assign(new Error(code), { code });
}

function approvedPath(url, sourceSha) {
  if (url === `${ROOT}/branches/master` ||
      /^\/repos\/ChipIn-one\/\.github\/actions\/(?:runs|artifacts)\/[1-9]\d*$/u.test(url)) return true;
  return url === `${ROOT}/contents/automation/issue-admission.mjs?ref=${sourceSha}` ||
    url === `${ROOT}/contents/automation/metadata-migration.config.json?ref=${sourceSha}`;
}

function normalizeError(error) {
  const message = String(error?.stderr ?? '');
  const status = error?.status ?? null;
  if (/HTTP (?:401|403)/u.test(message) || [401, 403].includes(status)) return blocked('PERMISSION_DENIED');
  if (error?.code === 'ENOENT') return blocked('AUTH_UNAVAILABLE');
  return blocked('TRANSPORT_ERROR');
}

export function evidenceOptions({ args, env, run = execute, fetchImpl = fetch, sourceSha }) {
  if (!SHA.test(sourceSha) || !NAME.test(args['evidence-request-id'] ?? '') ||
      !/^[a-z\d](?:[a-z\d-]{0,37})$/iu.test(args['evidence-producer'] ?? '') ||
      !/^[1-9]\d*$/u.test(args['evidence-run-id'] ?? '') ||
      !/^[1-9]\d*$/u.test(args['evidence-artifact-id'] ?? '') ||
      Object.hasOwn(args, 'evidence-replay-dir')) throw blocked('TRUST_CONTEXT_MISSING');

  async function apiRead(url, binary = false) {
    if (binary ? !/^\/repos\/ChipIn-one\/\.github\/actions\/artifacts\/[1-9]\d*\/zip$/u.test(url)
      : !approvedPath(url, sourceSha)) throw blocked('READ_ONLY_VIOLATION');
    if (env.GITHUB_TOKEN) {
      try {
        const response = await fetchImpl(`https://api.github.com${url}`, {
          method: 'GET', redirect: 'follow',
          headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN}` },
          signal: AbortSignal.timeout(20_000)
        });
        if (!response.ok) throw Object.assign(new Error('read failed'), { status: response.status });
        if (binary) {
          const data = Buffer.from(await response.arrayBuffer());
          if (data.length > MAX_ZIP) throw blocked('UNTRUSTED_ARTIFACT');
          return data;
        }
        return await response.json();
      } catch (cause) {
        if (cause?.code === 'READ_ONLY_VIOLATION' || cause?.code === 'UNTRUSTED_ARTIFACT') throw cause;
        throw normalizeError(cause);
      }
    }
    try {
      const { stdout } = await run('gh', ['api', url, '--method', 'GET', '--hostname', 'github.com'], {
        env: { ...env, GH_HOST: 'github.com' }, timeout: 20_000, maxBuffer: binary ? MAX_ZIP + 1024 : 4 * 1024 * 1024,
        encoding: binary ? 'buffer' : 'utf8'
      });
      if (binary) {
        if (!Buffer.isBuffer(stdout)) throw blocked('TRANSPORT_ERROR');
        const bytes = stdout;
        if (bytes.length > MAX_ZIP) throw blocked('UNTRUSTED_ARTIFACT');
        return bytes;
      }
      return JSON.parse(stdout.toString());
    } catch (cause) {
      if (cause?.code === 'UNTRUSTED_ARTIFACT') throw cause;
      throw normalizeError(cause);
    }
  }

  // The verifier invokes this function only after checking run, source, archive
  // digest, payload, canonical receipt and freshness. Exclusive creation is
  // the durable, cross-process replay boundary: never overwrite a consumed ID.
  async function recordConsumed(key) {
    if (!/^ChipIn-one\/\.github\/[1-9]\d*\/[1-9]\d*\/[a-zA-Z0-9_-]+$/u.test(key)) return false;
    const directory = await openTrustedRegistry();
    const filename = createHash('sha256').update(key).digest('hex');
    let file;
    try {
      file = await open(path.join(directory, filename), 'wx', 0o600);
    } catch (cause) {
      if (cause?.code === 'EEXIST') return false;
      throw blocked('REPLAY_REGISTRY_UNAVAILABLE');
    }
    try {
      await file.writeFile(key + '\n');
      await file.sync();
      return true;
    } finally {
      await file.close();
    }
  }

  const runId = Number(args['evidence-run-id']);
  const artifactId = Number(args['evidence-artifact-id']);
  if (!Number.isSafeInteger(runId) || !Number.isSafeInteger(artifactId)) {
    throw blocked('TRUST_CONTEXT_MISSING');
  }
  return {
    api: { request: async (url, options = {}) => {
      if (options.method && options.method !== 'GET' || options.body !== undefined) {
        throw blocked('READ_ONLY_VIOLATION');
      }
      return apiRead(url);
    } },
    downloadZip: async id => {
      if (id !== artifactId) throw blocked('UNTRUSTED_ARTIFACT');
      return apiRead(`${ROOT}/actions/artifacts/${id}/zip`, true);
    },
    recordConsumed, runId, artifactId,
    expectedIssue: args.issue,
    expectedRevision: args['expected-revision'],
    expectedRequestId: args['evidence-request-id'],
    expectedProducer: args['evidence-producer'],
    expectedSourceSha: sourceSha,
  };
}
